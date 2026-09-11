"use strict";


function withTemporaryXCookie(xCookie, work, done) {
    if (!xCookie || !chrome.cookies) { work(function(){ done(); }); return; }
    var url = "https://mas-ext.amazon.com/";
    chrome.cookies.get({url:url,name:"x-cookie"}, function(previous) {
        chrome.cookies.set({url:url,name:"x-cookie",value:xCookie,path:"/",secure:true}, function() {
            APKDebug.log("downloadSessionBinding", "COOKIE_JAR_SET", {name:"x-cookie", value:"[REDACTED]", previousCookiePresent:!!previous});
            work(function restore() {
                function finishRestore() { if (done) done(); }
                if (previous && previous.value !== undefined) {
                    chrome.cookies.set({url:url,name:"x-cookie",value:previous.value,path:previous.path || "/",secure:previous.secure !== false}, function(){
                        APKDebug.log("downloadSessionBinding", "COOKIE_JAR_RESTORED", {previousCookiePresent:true});
                        finishRestore();
                    });
                } else {
                    chrome.cookies.remove({url:url,name:"x-cookie"}, function(){
                        APKDebug.log("downloadSessionBinding", "COOKIE_JAR_REMOVED", {previousCookiePresent:false});
                        finishRestore();
                    });
                }
            });
        });
    });
}

function minimalDeviceInfoForDownload(profileSpecs, descriptor) {
    var p={}; try { p=JSON.parse(profileSpecs || "{}"); } catch(e) {}
    var d=p.deviceInfo || {};
    return {
        ref: d.ref || "unknown",
        model: d.model || "unknown",
        deviceDescriptorId: descriptor || "",
        osVersion: d.APILevel || d.releaseVersion || "",
        deviceType: d.deviceType || p.deviceType || "",
        manufacturer: d.manufacturer || "Amazon",
        carrier: d.carrier || "unknown",
        build_fingerprint: d["build.fingerprint"] || "",
        build_product: d["build.product"] || ""
    };
}


function variantDiscoveryExtract(text) {
    var result={parsed:false,candidates:[],snippets:[],topLevelType:null};
    function add(path,key,value){
        var sval;
        try { sval=(typeof value==="string")?value:JSON.stringify(value); } catch(e){ sval=String(value); }
        if(sval && sval.length>1200) sval=sval.substring(0,1200)+"...";
        result.candidates.push({path:path,key:key,value:sval});
    }
    function walk(node,path,depth){
        if(depth>18 || node===null || node===undefined) return;
        if(Array.isArray(node)){ for(var i=0;i<node.length && i<400;i++) walk(node[i],path+"["+i+"]",depth+1); return; }
        if(typeof node!=="object") return;
        Object.keys(node).forEach(function(k){
            var v=node[k], lk=k.toLowerCase();
            if(/version|contentid|content_id|latestcontent|artifact|apk|package|variant|device|compat|delivery|binary|architecture|abi|min.?sdk|target.?sdk|release|offer|entitle|supported/.test(lk)) add(path+"."+k,k,v);
            if(v && typeof v==="object") walk(v,path+"."+k,depth+1);
        });
    }
    try {
        var parsed=JSON.parse(text); result.parsed=true; result.topLevelType=Array.isArray(parsed)?"array":typeof parsed; walk(parsed,"$",0);
    } catch(e) {
        result.parseError=String(e);
        var rx=/.{0,220}(?:version|contentId|latestContentId|artifact|apk|package|variant|deviceType|compatible|delivery|minSdk|targetSdk|armeabi|arm64|x86).{0,420}/ig, m, n=0;
        while((m=rx.exec(text)) && n<80){ result.snippets.push(m[0]); n++; }
    }
    result.candidates=result.candidates.slice(0,250);
    return result;
}


function collectVersionSweepCandidates(retailVersion, trace) {
    var out=[], seen={};
    function add(v, source) {
        if (v===undefined || v===null) return;
        var sv=String(v).trim();
        if (!/^\d+$/.test(sv)) return;
        var n=parseInt(sv,10);
        if (!isFinite(n) || n<0 || n>10000000) return;
        sv=String(n);
        if (seen[sv]) return;
        seen[sv]=true;
        out.push({version:sv,source:source||"unknown"});
    }
    add(retailVersion,"retail-appVersionNo");
    add("0","control-zero");
    add("1","legacy-one");

    function walk(node,path,depth) {
        if (!node || depth>12) return;
        if (Array.isArray(node)) { for (var i=0;i<node.length && i<300;i++) walk(node[i],path+"["+i+"]",depth+1); return; }
        if (typeof node!=="object") return;
        Object.keys(node).forEach(function(k){
            var v=node[k], lk=k.toLowerCase();
            if (/version|versioncode|appversion|kiwiversion/.test(lk)) {
                if (typeof v==="string" || typeof v==="number") add(v,"trace:"+path+"."+k);
            }
            if (v && typeof v==="object") walk(v,path+"."+k,depth+1);
        });
    }
    if (trace) walk(trace,"$",0);

    var r=parseInt(String(retailVersion||""),10);
    if (isFinite(r) && r>=0) {
        for (var d=1; d<=24; d++) if (r-d>=0) add(r-d,"bounded-descending-"+d);
        for (var u=1; u<=5; u++) add(r+u,"bounded-ascending+"+u);
    }
    return out.slice(0,40);
}

function runDownloadVersionSweep(args, callback) {
    chrome.storage.local.get(["apk_debug_last_retail_variant_trace"], function(saved) {
        var trace=saved && saved.apk_debug_last_retail_variant_trace;
        var candidates=collectVersionSweepCandidates(args.retailVersion, trace && (!trace.asin || trace.asin===args.asin) ? trace : null);
        var report={
            asin:args.asin,
            startedAt:new Date().toISOString(),
            retailVersion:String(args.retailVersion||""),
            deliveryCredentialMode:args.useAssociated?"associated":"main",
            profileKey:args.profileInfo && args.profileInfo.key || null,
            profileName:args.profileInfo && args.profileInfo.name || null,
            candidateCount:candidates.length,
            candidates:candidates,
            attempts:[]
        };
        APKDebug.log("downloadVersionSweep","START",{asin:args.asin,retailVersion:report.retailVersion,candidateCount:candidates.length,candidates:candidates});
        var i=0;
        function finish(successResult) {
            report.completedAt=new Date().toISOString();
            report.success=!!successResult;
            if (successResult) {
                report.selectedVersion=successResult.version;
                report.packageName=successResult.result && successResult.result.packageName || null;
                report.androidVersionCode=successResult.result && successResult.result.androidVersionCode || null;
            }
            chrome.storage.local.set({apk_debug_last_version_sweep:report},function(){
                APKDebug.log("downloadVersionSweep",successResult?"SUCCESS":"EXHAUSTED",{asin:args.asin,selectedVersion:successResult&&successResult.version||null,attempts:report.attempts.length});
                callback(successResult,report);
            });
        }
        function next() {
            if (i>=candidates.length) { finish(null); return; }
            var c=candidates[i++];
            var body=JSON.stringify({asin:args.asin,hasExpiry:true,version:c.version});
            var stage="getDownloadUrl.version-sweep."+c.version;
            APKDebug.log("downloadVersionSweep","ATTEMPT",{attempt:i,total:candidates.length,version:c.version,source:c.source});
            AppstoreAPI.getDownloadUrl(
                body,args.activeToken,args.activeKey,
                function(result){
                    report.attempts.push({version:c.version,source:c.source,status:"success",packageName:result.packageName||null,androidVersionCode:result.androidVersionCode||null,asinVersionInfo:result.asinVersionInfo||null});
                    finish({version:c.version,result:result});
                },
                function(type,message){
                    report.attempts.push({version:c.version,source:c.source,status:"error",errorType:type||"Unknown",message:message||""});
                    APKDebug.log("downloadVersionSweep","FAILED",{version:c.version,source:c.source,errorType:type||"Unknown",message:message||""});
                    if (type==="CustomerNotEntitledException") { finish(null); return; }
                    next();
                },
                args.profileInfo,
                {name:"version-sweep",debugStage:stage,extraHeaders:{},credentialsMode:"omit",descriptorPresent:!!args.descriptor,xCookiePresent:!!args.xCookie,credentialModeLabel:args.useAssociated?"firs-associated-delivery-identity":"auth/register-mac_dms-direct",firsAssociatedStage:args.useAssociated?"completed":"not-used"}
            );
        }
        next();
    });
}



function runDeviceAccountDeliveryMatrix(args, callback) {
    chrome.storage.local.get(["apk_debug_last_account_delivery_trace"], function(saved) {
        var trace=saved && saved.apk_debug_last_account_delivery_trace;
        var records=(trace && trace.deliveryAnalysis && trace.deliveryAnalysis.accountDeviceMap) || (trace && trace.deviceRecords) || [];
        records=records.filter(function(r){return r && r.deviceAccountID;});
        if(!records.length){ callback(null,{error:"No correlated deviceAccountID records found. Capture Account Device Delivery Trace first."}); return; }
        var selected=null;
        if(args.deviceAccountID) selected=records.find(function(r){return r.deviceAccountID===args.deviceAccountID;});
        if(!selected) selected=records.find(function(r){return /5th Android Device/i.test(r.deviceName||"");}) || records[records.length-1];
        var accountId=selected.deviceAccountID;
        var minimal=minimalDeviceInfoForDownload(args.profileSpecs,args.descriptor);
        var variants=[
            {name:"baseline",headers:{},body:{}},
            {name:"x-device-account-id",headers:{"X-Device-Account-Id":accountId},body:{}},
            {name:"x-deviceaccountid",headers:{"X-DeviceAccountId":accountId},body:{}},
            {name:"body-deviceAccountId",headers:{},body:{deviceAccountId:accountId}},
            {name:"body-deviceAccountID",headers:{},body:{deviceAccountID:accountId}},
            {name:"body-deviceId",headers:{},body:{deviceId:accountId}},
            {name:"body-deviceInfo-deviceAccountId",headers:{},body:{deviceInfo:Object.assign({},minimal,{deviceAccountId:accountId})}}
        ];
        var report={asin:args.asin,version:String(args.version||"1"),startedAt:new Date().toISOString(),deliveryCredentialMode:args.useAssociated?"associated":"main",selectedDevice:{deviceName:selected.deviceName||null,deviceAccountID:accountId,deviceTypeID:selected.deviceTypeID||null},variants:variants.map(function(v){return v.name;}),attempts:[]};
        APKDebug.log("deviceAccountDeliveryMatrix","START",{asin:report.asin,version:report.version,selectedDevice:report.selectedDevice,variants:report.variants});
        var i=0;
        function finish(hit){report.completedAt=new Date().toISOString();report.success=!!hit;if(hit)report.successVariant=hit.variant;chrome.storage.local.set({apk_debug_last_device_account_matrix:report},function(){APKDebug.log("deviceAccountDeliveryMatrix",hit?"SUCCESS":"EXHAUSTED",{selectedDevice:report.selectedDevice,successVariant:hit&&hit.variant||null,attempts:report.attempts.length});callback(hit,report);});}
        function next(){
            if(i>=variants.length){finish(null);return;}
            var v=variants[i++], req=Object.assign({asin:args.asin,hasExpiry:true,version:String(args.version||"1")},v.body||{});
            APKDebug.log("deviceAccountDeliveryMatrix","ATTEMPT",{attempt:i,total:variants.length,variant:v.name,selectedDevice:report.selectedDevice});
            AppstoreAPI.getDownloadUrl(JSON.stringify(req),args.activeToken,args.activeKey,function(result){
                report.attempts.push({variant:v.name,status:"success",packageName:result.packageName||null,androidVersionCode:result.androidVersionCode||null,asinVersionInfo:result.asinVersionInfo||null});finish({variant:v.name,result:result});
            },function(type,message){
                report.attempts.push({variant:v.name,status:"error",errorType:type||"Unknown",message:message||""});APKDebug.log("deviceAccountDeliveryMatrix","FAILED",{variant:v.name,errorType:type||"Unknown",message:message||""});if(type==="CustomerNotEntitledException"){finish(null);return;}next();
            },args.profileInfo,{name:"device-account-"+v.name,debugStage:"getDownloadUrl.device-account."+v.name,extraHeaders:v.headers||{},credentialsMode:"omit",descriptorPresent:!!args.descriptor,xCookiePresent:!!args.xCookie,credentialModeLabel:args.useAssociated?"firs-associated-delivery-identity":"auth/register-mac_dms-direct",firsAssociatedStage:args.useAssociated?"completed":"not-used"});
        }
        next();
    });
}




function runModelCompatibilityMatrix(args, callback) {
    /* v0.5.30: Fire HD 8 (2024) direct auth/register identity experiment.
       v0.5.29 proved that A17AIVOKIKR4QQ is not accepted by the FIRS
       registerAssociatedDevice path (or at least not with our current parent
       identity). Rather than treating a tablet like an associated Fire TV
       device, request a fresh mac_dms credential pair directly from
       api.amazon.com/auth/register using the KFRASWI tablet identity, then use
       that credential pair end-to-end for MAS registration and delivery. */
    var FIREHD8_DEVICE_TYPE="A17AIVOKIKR4QQ";
    var FIREHD8_MODEL="KFRASWI";
    var steps=[
      {key:"kfraswi-aftmm-baseline",name:"KFRASWI model + complete AFTMM/mantis baseline",apply:function(root,d){}},
      {key:"api-release",name:"+ Fire HD 8 (2024) API 30 / Android 11",apply:function(root,d){d.APILevel="30";d.releaseVersion="11";}},
      {key:"raspite-build",name:"+ raspite tablet build identity",apply:function(root,d){d["build.device"]="raspite";d["build.product"]="raspite";d["build.hardware"]="raspite";d["build.board"]="raspite";d["build.id"]="RS8338.3339N";d.display="RS8338.3339N";d["build.fingerprint"]="Amazon/raspite/raspite:11/RS8338.3339N/0030132734852:user/amz-p,release-keys";}},
      {key:"abi-gpu",name:"+ Fire HD 8 32/64-bit ABI / OpenGL ES 3.2",apply:function(root,d){d.cpuABI="arm64-v8a";d["build.cpuABI2"]="armeabi-v7a";d.openGlEsVersion="0x00030002";d.openGlEsExtensions="GL_OES_EGL_image GL_OES_EGL_image_external GL_OES_element_index_uint GL_OES_texture_npot GL_OES_vertex_array_object GL_EXT_texture_format_BGRA8888 GL_KHR_debug";}},
      {key:"display",name:"+ Fire HD 8 1280x800 / tvdpi display",apply:function(root,d){d["screenRealSize.width"]="1280";d["screenRealSize.height"]="800";d["screenSize.width"]="1280";d["screenSize.height"]="800";d.deviceDisplayPixelsWidth="1280";d.deviceDisplayPixelsHeight="800";d.deviceDisplayXDpi="213";d.deviceDisplayYDpi="213";d.deviceDensityClassification="213";d.deviceDensityLogical="1.33125";d.deviceDensityScaled="1.33125";d.deviceScreenLayout="SCREENLAYOUT_SIZE_LARGE";d.sizeRangeSmallest="800 , 720";d.sizeRangeLargest="1280 , 1200";}},
      {key:"tablet-capabilities",name:"+ Fire HD 8 touchscreen/tablet capabilities",apply:function(root,d){d.deviceTouchscreen="TOUCHSCREEN_FINGER";d["android.hardware.screen.portrait"]="true";d["android.hardware.screen.landscape"]="true";d["android.hardware.touchscreen"]="true";d["android.hardware.touchscreen.multitouch"]="true";d["android.hardware.touchscreen.multitouch.distinct"]="true";d["android.hardware.touchscreen.multitouch.jazzhand"]="true";d["android.hardware.camera"]="true";d["android.hardware.camera.any"]="true";d["android.hardware.camera.front"]="true";d["android.hardware.camera.autofocus"]="false";d["android.hardware.camera.flash"]="false";d["android.hardware.consumerir"]="false";d["android.hardware.location"]="true";d["android.hardware.location.network"]="true";d["android.hardware.location.gps"]="false";d["android.hardware.telephony"]="false";d["android.hardware.telephony.gsm"]="false";d["android.hardware.sensor.accelerometer"]="true";d["android.hardware.sensor.light"]="true";d["android.hardware.sensor.barometer"]="false";d["android.hardware.sensor.compass"]="false";d["android.hardware.sensor.gyroscope"]="false";d["android.hardware.sensor.proximity"]="false";d["android.software.sip.voip"]="false";d.isPreloaded="true";d.isRooted="false";d.isEmulator="false";d.capabilitiesCodeVersion="2.0";}},
      {key:"full-firehd8-2024",name:"Full Fire HD 8 (2024) KFRASWI tablet profile",full:true,apply:function(root,d){}}
    ];
    function baseRoot(){
        var root=JSON.parse(args.profile.specs||"{}"); root.deviceInfo=root.deviceInfo||{}; var d=root.deviceInfo;
        root.deviceType=FIREHD8_DEVICE_TYPE; d.deviceType=FIREHD8_DEVICE_TYPE; d.model=FIREHD8_MODEL; d.APILevel="24"; d.releaseVersion="8.0";
        d["build.device"]="mantis"; d["build.product"]="mantis"; d["build.hardware"]="mantis"; d["build.board"]="universal5422"; d["build.id"]="AFTMM"; d.display="AFTMM";
        d["build.fingerprint"]="Amazon/mantis/mantis:8.0/NS6268/2315N:user/amz-p,release-keys";
        return root;
    }
    function applyTabletFull(root){
        var d=root.deviceInfo||{};
        root.deviceType=FIREHD8_DEVICE_TYPE; d.deviceType=FIREHD8_DEVICE_TYPE; d.model=FIREHD8_MODEL; d.APILevel="30"; d.releaseVersion="11";
        d["build.device"]="raspite";d["build.product"]="raspite";d["build.hardware"]="raspite";d["build.board"]="raspite";d["build.id"]="RS8338.3339N";d.display="RS8338.3339N";d["build.fingerprint"]="Amazon/raspite/raspite:11/RS8338.3339N/0030132734852:user/amz-p,release-keys";
        d.cpuABI="arm64-v8a";d["build.cpuABI2"]="armeabi-v7a";d.openGlEsVersion="0x00030002";
        d["screenRealSize.width"]="1280";d["screenRealSize.height"]="800";d["screenSize.width"]="1280";d["screenSize.height"]="800";d.deviceDisplayPixelsWidth="1280";d.deviceDisplayPixelsHeight="800";d.deviceDisplayXDpi="213";d.deviceDisplayYDpi="213";d.deviceDensityClassification="213";d.deviceDensityLogical="1.33125";d.deviceDensityScaled="1.33125";d.deviceScreenLayout="SCREENLAYOUT_SIZE_LARGE";d.deviceTouchscreen="TOUCHSCREEN_FINGER";
        d["android.hardware.screen.portrait"]="true";d["android.hardware.screen.landscape"]="true";d["android.hardware.touchscreen"]="true";d["android.hardware.touchscreen.multitouch"]="true";d["android.hardware.touchscreen.multitouch.distinct"]="true";d["android.hardware.touchscreen.multitouch.jazzhand"]="true";d["android.hardware.camera"]="true";d["android.hardware.camera.any"]="true";d["android.hardware.camera.front"]="true";d["android.hardware.camera.autofocus"]="false";d["android.hardware.camera.flash"]="false";d["android.hardware.location"]="true";d["android.hardware.location.network"]="true";d["android.hardware.location.gps"]="false";d["android.hardware.sensor.accelerometer"]="true";d["android.hardware.sensor.light"]="true";d["android.hardware.sensor.compass"]="false";d["android.hardware.sensor.gyroscope"]="false";d["android.hardware.sensor.proximity"]="false";d["android.hardware.telephony"]="false";d["android.hardware.telephony.gsm"]="false";d.isPreloaded="true";d.isRooted="false";d.isEmulator="false";d.capabilitiesCodeVersion="2.0";
        return root;
    }
    function profileFor(index){
        var root=baseRoot(),d=root.deviceInfo;
        for(var i=1;i<=index;i++){
            if(steps[i].full){root=applyTabletFull(root);d=root.deviceInfo||{};}
            else steps[i].apply(root,d);
        }
        d.model=FIREHD8_MODEL;
        return {key:"kfraswi-convergence-"+steps[index].key,name:steps[index].name,specs:JSON.stringify(root)};
    }
    var report={build:"0.5.30-firehd8-direct-auth-register-debug",startedAt:new Date().toISOString(),targetAsin:args.asin,targetVersion:String(args.version||"1"),controlAsin:"B00YPIFS3W",controlVersion:"0",model:FIREHD8_MODEL,deviceType:FIREHD8_DEVICE_TYPE,device:"Fire HD 8 (2024, 12th Gen, 4GB)",credentialStrategy:"direct-auth-register-mac_dms",stopOnTargetSuccess:true,steps:steps.map(function(s,i){return {index:i,key:s.key,name:s.name};}),results:[]};
    APKDebug.log("kfraswiDirectAuthMatrix","START",{targetAsin:report.targetAsin,targetVersion:report.targetVersion,deviceType:FIREHD8_DEVICE_TYPE,steps:report.steps});
    var originalDescriptor=args.savedDescriptor||"",originalCookie=args.savedCookie||"",jackpot=null;
    function finish(){BrowserStorage.set({appstore_device_descriptor_id:originalDescriptor,appstore_identity_x_cookie:originalCookie},function(){report.completedAt=new Date().toISOString();report.jackpot=jackpot;chrome.storage.local.set({apk_debug_last_model_compatibility_matrix:report},function(){APKDebug.log("kfraswiDirectAuthMatrix","COMPLETE",{results:report.results.length,jackpot:jackpot,authRegister:report.authRegister||null});callback(report);});});}
    function download(label,asin,version,token,key,profile,done){
      var parsed=JSON.parse(profile.specs),d=parsed.deviceInfo||{};
      var pi={profileKey:profile.key,profileName:profile.name,model:d.model,appstoreProfileDeviceType:parsed.deviceType,authDeviceType:FIREHD8_DEVICE_TYPE,historicalAssociatedDeviceType:null};
      AppstoreAPI.getDownloadUrl(JSON.stringify({asin:asin,hasExpiry:true,version:String(version)}),token,key,function(r){done({status:"success",packageName:r.packageName||null,androidVersionCode:r.androidVersionCode||null,asinVersionInfo:r.asinVersionInfo||null});},function(type,message){done({status:"error",errorType:type||"Unknown",message:message||""});},pi,{name:"kfraswi-direct-"+label,debugStage:"getDownloadUrl.kfraswi-direct."+label,extraHeaders:{},credentialsMode:"omit",descriptorPresent:false,xCookiePresent:false,credentialModeLabel:"auth/register-kfraswi-mac_dms",firsAssociatedStage:"not-used"});
    }
    if(!args.user || !args.user.access_token || !args.user.device || !args.user.device.device_serial){
      report.authRegister={status:"error",errorType:"NoWorkingSession",message:"A working Amazon OAuth session and device serial are required."}; finish(); return;
    }
    var identity={preset:"firehd8-2024-kfraswi",deviceType:FIREHD8_DEVICE_TYPE,deviceModel:FIREHD8_MODEL,osVersion:"11"};
    APKDebug.log("kfraswiDirectAuthMatrix","AUTH_REGISTER_START",identity);
    AppstoreAPI.probeRegisterIdentity(args.user.access_token,args.user.device.device_serial,identity,function(response){
      var tokens=response&&response.success&&response.success.tokens?response.success.tokens:{};
      var mac=tokens.mac_dms||null;
      if(!mac || !mac.adp_token || !mac.device_private_key){
        report.authRegister={status:"error",errorType:"IncompleteMacDms",message:"auth/register accepted KFRASWI but did not return a complete mac_dms credential pair.",tokenTypes:response&&response.success&&response.success.tokens?Object.keys(response.success.tokens):[]};
        APKDebug.log("kfraswiDirectAuthMatrix","AUTH_REGISTER_INCOMPLETE",report.authRegister); finish(); return;
      }
      report.authRegister={status:"success",deviceType:FIREHD8_DEVICE_TYPE,model:FIREHD8_MODEL,macDmsPresent:true,tokenTypes:Object.keys(tokens)};
      APKDebug.log("kfraswiDirectAuthMatrix","AUTH_REGISTER_SUCCESS",report.authRegister);
      var token=mac.adp_token,key=mac.device_private_key,i=0;
      function next(){
        if(jackpot||i>=steps.length){finish();return;}
        var idx=i++,step=steps[idx],profile=profileFor(idx),row={index:idx,key:step.key,name:step.name,startedAt:new Date().toISOString()};report.results.push(row);
        var parsed=JSON.parse(profile.specs),d=parsed.deviceInfo||{};
        row.profile={outerDeviceType:parsed.deviceType,nestedDeviceType:d.deviceType,model:d.model,apiLevel:d.APILevel,releaseVersion:d.releaseVersion,cpuABI:d.cpuABI,width:d.deviceDisplayPixelsWidth,height:d.deviceDisplayPixelsHeight,density:d.deviceDensityClassification,buildDevice:d["build.device"],buildProduct:d["build.product"],buildHardware:d["build.hardware"],buildId:d["build.id"],touchscreen:d["android.hardware.touchscreen"],portrait:d["android.hardware.screen.portrait"],capabilitiesCodeVersion:d.capabilitiesCodeVersion};
        APKDebug.log("kfraswiDirectAuthMatrix","TEST_START",{index:idx,total:steps.length,key:step.key,name:step.name,profile:row.profile});
        AppstoreAPI.appstoreOnlyRegisterDevice(profile.specs,token,key,function(xhr){
          row.mas={status:"success"};try{var m=JSON.parse(xhr.responseText||"{}");row.mas.deviceDescriptorPresent=!!m.deviceDescriptorId;row.mas.xCookiePresent=!!(m.identityTokens||[]).find(function(x){return x&&x.name==="x-cookie";});}catch(_){}
          download(step.key+".control",report.controlAsin,report.controlVersion,token,key,profile,function(c){row.control=c;
            download(step.key+".target",report.targetAsin,report.targetVersion,token,key,profile,function(target){row.target=target;row.completedAt=new Date().toISOString();
              if(c.status==="success"&&target.status==="success")row.classification="control-and-target-success"; else if(c.status==="success")row.classification="control-success-target-incompatible"; else if(target.status==="success")row.classification="control-incompatible-target-success"; else row.classification="both-incompatible";
              if(target.status==="success"){jackpot={index:idx,key:step.key,name:step.name,classification:row.classification,profile:row.profile,packageName:target.packageName||null,androidVersionCode:target.androidVersionCode||null};APKDebug.log("kfraswiDirectAuthMatrix","TARGET_SUCCESS_STOP",jackpot);}
              APKDebug.log("kfraswiDirectAuthMatrix","TEST_COMPLETE",{index:idx,key:step.key,classification:row.classification,controlStatus:c.status,controlError:c.errorType||null,targetStatus:target.status,targetError:target.errorType||null});next();
            });
          });
        },function(type,message){row.mas={status:"error",errorType:type||"Unknown",message:message||""};row.classification="mas-failed";APKDebug.log("kfraswiDirectAuthMatrix","MAS_FAILED",{index:idx,key:step.key,errorType:type||"Unknown",message:message||""});next();},true,"kfraswiDirectAuthMatrix.mas."+step.key);
      }
      next();
    },function(parsed){
      var code="Unknown",message="Amazon rejected the KFRASWI auth/register identity.";
      try{code=parsed.response.error.code||code;message=parsed.response.error.message||message;}catch(_){}
      report.authRegister={status:"error",errorType:code,message:message};
      APKDebug.log("kfraswiDirectAuthMatrix","AUTH_REGISTER_FAILED",report.authRegister); finish();
    });
}

function runCapabilitySensitivityMatrix(args, callback) {
    /* v0.5.24: start from the known-working AFTMM/A3GFS profile and mutate one
       capability dimension at a time. FIRS credentials remain A3GFS so the
       experiment isolates MAS deviceInfo sensitivity as much as possible. */
    var baseCandidate={deviceType:"A3GFS040JDOGQR",model:"AFTMM"};
    function clone(o){return JSON.parse(JSON.stringify(o));}
    function profileFor(test){
        var root=JSON.parse(args.profile.specs||"{}"); root.deviceInfo=root.deviceInfo||{}; var d=root.deviceInfo;
        /* Force the known-good AFTMM baseline first. */
        root.deviceType="A3GFS040JDOGQR"; d.deviceType="A3GFS040JDOGQR"; d.model="AFTMM"; d.APILevel="24"; d.releaseVersion="8.0";
        d["build.device"]="mantis"; d["build.product"]="mantis"; d["build.hardware"]="mantis"; d["build.id"]="AFTMM"; d.display="AFTMM";
        d["build.fingerprint"]="Amazon/mantis/mantis:8.0/NS6268/2315N:user/amz-p,release-keys";
        if(test.key==="device-type-only"){root.deviceType="AZDQ9AW1RNF81";d.deviceType="AZDQ9AW1RNF81";}
        else if(test.key==="model-only"){d.model="AFTMA08C15";}
        else if(test.key==="api-release-only"){d.APILevel="30";d.releaseVersion="11";}
        else if(test.key==="tv-feature-minimal"){
            d["android.hardware.location"]="false";d["android.hardware.location.network"]="false";
            d["android.hardware.sensor.accelerometer"]="false";d["android.hardware.sensor.barometer"]="false";d["android.hardware.sensor.compass"]="false";d["android.hardware.sensor.gyroscope"]="false";d["android.hardware.sensor.light"]="false";d["android.hardware.sensor.proximity"]="false";d["android.hardware.sensor.stepcounter"]="false";d["android.hardware.sensor.stepdetector"]="false";
            d["android.software.app_widgets"]="false";d["android.software.live_wallpaper"]="false";
        }
        else if(test.key==="cpu-abi-only"){d.cpuABI="arm64-v8a";d["build.cpuABI2"]="armeabi-v7a";}
        else if(test.key==="screen-density-only"){
            d.deviceDensityClassification="320";d.deviceDensityLogical="2.0";d.deviceDensityScaled="2.0";d.deviceDisplayPixelsWidth="1920";d.deviceDisplayPixelsHeight="1080";d["screenRealSize.width"]="1920";d["screenRealSize.height"]="1080";d["screenSize.width"]="1920";d["screenSize.height"]="1080";d.sizeRangeLargest="1920 , 1080";d.sizeRangeSmallest="1080 , 1005";
        }
        else if(test.key==="build-identity-only"){
            d["build.device"]="AFTMA08C15";d["build.product"]="AFTMA08C15";d["build.hardware"]="AFTMA08C15";d["build.id"]="AFTMA08C15";d.display="AFTMA08C15";d["build.fingerprint"]="Amazon/AFTMA08C15/AFTMA08C15:8.0/AFTMA08C15/candidate:user/amz-p,release-keys";
        }
        return {key:"capability-"+test.key,name:test.name,specs:JSON.stringify(root)};
    }
    var tests=[
      {key:"baseline",name:"AFTMM known-working baseline"},
      {key:"device-type-only",name:"Device type only -> AZDQ9AW1RNF81"},
      {key:"model-only",name:"Model only -> AFTMA08C15"},
      {key:"api-release-only",name:"API/release only -> API 30 / Android 11"},
      {key:"tv-feature-minimal",name:"TV feature set -> minimal sensors/software"},
      {key:"cpu-abi-only",name:"CPU/ABI only -> arm64-v8a"},
      {key:"screen-density-only",name:"Screen/density only -> 1920x1080 / 320dpi"},
      {key:"build-identity-only",name:"Build identity only -> AFTMA08C15 labels"}
    ];
    var report={build:"0.5.24.1-capability-probe-ui-fix",startedAt:new Date().toISOString(),targetAsin:args.asin,targetVersion:String(args.version||"1"),controlAsin:"B00YPIFS3W",controlVersion:"0",tests:tests,results:[]};
    APKDebug.log("capabilitySensitivityMatrix","START",{targetAsin:report.targetAsin,targetVersion:report.targetVersion,tests:tests.map(function(t){return t.key;})});
    var originalDescriptor=args.savedDescriptor||"",originalCookie=args.savedCookie||"";
    function finish(){BrowserStorage.set({appstore_device_descriptor_id:originalDescriptor,appstore_identity_x_cookie:originalCookie},function(){report.completedAt=new Date().toISOString();chrome.storage.local.set({apk_debug_last_capability_sensitivity_matrix:report},function(){APKDebug.log("capabilitySensitivityMatrix","COMPLETE",{results:report.results.length});callback(report);});});}
    function download(label,asin,version,token,key,profile,done){
      var pi={profileKey:profile.key,profileName:profile.name,model:(JSON.parse(profile.specs).deviceInfo||{}).model,appstoreProfileDeviceType:(JSON.parse(profile.specs).deviceType),authDeviceType:"A1MPSLFC7L5AFK",historicalAssociatedDeviceType:"A3GFS040JDOGQR"};
      AppstoreAPI.getDownloadUrl(JSON.stringify({asin:asin,hasExpiry:true,version:String(version)}),token,key,function(r){done({status:"success",packageName:r.packageName||null,androidVersionCode:r.androidVersionCode||null,asinVersionInfo:r.asinVersionInfo||null});},function(type,message){done({status:"error",errorType:type||"Unknown",message:message||""});},pi,{name:"capability-"+label,debugStage:"getDownloadUrl.capability."+label,extraHeaders:{},credentialsMode:"omit",descriptorPresent:false,xCookiePresent:false,credentialModeLabel:"firs-a3gfs-capability-matrix",firsAssociatedStage:"matrix"});
    }
    AppstoreAPI.registerAssociatedDevice(args.user,function(u,assoc){
      APKDebug.log("capabilitySensitivityMatrix","FIRS_SUCCESS",{deviceType:"A3GFS040JDOGQR"}); var i=0;
      function next(){if(i>=tests.length){finish();return;}var t=tests[i++],profile=profileFor(t),row={key:t.key,name:t.name,startedAt:new Date().toISOString()};report.results.push(row);var parsed=JSON.parse(profile.specs),d=parsed.deviceInfo||{};row.profile={outerDeviceType:parsed.deviceType,nestedDeviceType:d.deviceType,model:d.model,apiLevel:d.APILevel,releaseVersion:d.releaseVersion,cpuABI:d.cpuABI,width:d.deviceDisplayPixelsWidth,height:d.deviceDisplayPixelsHeight,density:d.deviceDensityClassification,buildDevice:d["build.device"],buildProduct:d["build.product"]};APKDebug.log("capabilitySensitivityMatrix","TEST_START",{key:t.key,profile:row.profile});
        AppstoreAPI.appstoreOnlyRegisterDevice(profile.specs,assoc.adp_token,assoc.device_private_key,function(xhr){row.mas={status:"success"};try{var m=JSON.parse(xhr.responseText||"{}");row.mas.deviceDescriptorPresent=!!m.deviceDescriptorId;row.mas.xCookiePresent=!!(m.identityTokens||[]).find(function(x){return x&&x.name==="x-cookie";});}catch(_){}
          download(t.key+".control",report.controlAsin,report.controlVersion,assoc.adp_token,assoc.device_private_key,profile,function(c){row.control=c;download(t.key+".target",report.targetAsin,report.targetVersion,assoc.adp_token,assoc.device_private_key,profile,function(target){row.target=target;row.completedAt=new Date().toISOString();APKDebug.log("capabilitySensitivityMatrix","TEST_COMPLETE",{key:t.key,controlStatus:c.status,controlError:c.errorType||null,targetStatus:target.status,targetError:target.errorType||null});next();});});
        },function(type,message){row.mas={status:"error",errorType:type||"Unknown",message:message||""};APKDebug.log("capabilitySensitivityMatrix","MAS_FAILED",{key:t.key,errorType:type||"Unknown"});next();},true,"capabilitySensitivityMatrix.mas."+t.key);
      } next();
    },function(type,message){report.firs={status:"error",errorType:type||"Unknown",message:message||""};APKDebug.log("capabilitySensitivityMatrix","FIRS_FAILED",report.firs);finish();},{legacyAuth:false,associatedDeviceType:"A3GFS040JDOGQR",debugStage:"capabilitySensitivityMatrix.firs"});
}

function runAssociatedDeviceTypeMatrix(args, callback) {
    /* v0.5.32: Fire tablet associated-device-type discovery matrix. */
    var candidates = [
        {key:"historical-a3gfs", name:"Historical A3GFS / AFTMM control", deviceType:"A3GFS040JDOGQR", model:"AFTMM", apiLevel:"24", releaseVersion:"8.0", buildDevice:"mantis", buildProduct:"mantis", buildHardware:"mantis", buildId:"AFTMM", tablet:false, width:"1920", height:"1920", density:"480"},
        {key:"firehd8-2024-4gb", name:"Fire HD 8 (2024, 4GB) KFRASWI", deviceType:"A17AIVOKIKR4QQ", model:"KFRASWI", apiLevel:"30", releaseVersion:"11", buildDevice:"raspite", buildProduct:"raspite", buildHardware:"raspite", buildId:"RS8338.3339N", tablet:true, width:"1280", height:"800", density:"213"},
        {key:"firehd8-2022-3gb", name:"Fire HD 8 Plus (2022, 3GB) KFRAPWI", deviceType:"A1DOD0Z74XEFYC", model:"KFRAPWI", apiLevel:"30", releaseVersion:"11", buildDevice:"raspite", buildProduct:"raspite", buildHardware:"raspite", buildId:"RS8338.3339N", tablet:true, width:"1280", height:"800", density:"213"},
        {key:"firehd8-2022-2gb", name:"Fire HD 8 (2022, 2GB) KFRAWI", deviceType:"A1TD5Z1R8IWBHA", model:"KFRAWI", apiLevel:"30", releaseVersion:"11", buildDevice:"raspite", buildProduct:"raspite", buildHardware:"raspite", buildId:"RS8338.3339N", tablet:true, width:"1280", height:"800", density:"213"},
        {key:"firehd10-2023", name:"Fire HD 10 (2023) KFTUWI", deviceType:"A2V9UEGZ82H4KZ", model:"KFTUWI", apiLevel:"30", releaseVersion:"11", buildDevice:"tungsten", buildProduct:"tungsten", buildHardware:"tungsten", buildId:"UT3A.231005.007", tablet:true, width:"1920", height:"1200", density:"213"},
        {key:"firemax11-2023", name:"Fire Max 11 (2023) KFSNWI", deviceType:"A2QCPPMSOLGVZE", model:"KFSNWI", apiLevel:"30", releaseVersion:"11", buildDevice:"sunstone", buildProduct:"sunstone", buildHardware:"sunstone", buildId:"RS8338.3339N", tablet:true, width:"2000", height:"1200", density:"240"},
        {key:"fire7-2022", name:"Fire 7 (2022) KFQUWI", deviceType:"A271DR1789MXDS", model:"KFQUWI", apiLevel:"30", releaseVersion:"11", buildDevice:"quartz", buildProduct:"quartz", buildHardware:"quartz", buildId:"RS8338.3339N", tablet:true, width:"1024", height:"600", density:"171"},
        {key:"firehd10-2021", name:"Fire HD 10 (2021) KFTRWI", deviceType:"ATNLRCEBX3W4P", model:"KFTRWI", apiLevel:"28", releaseVersion:"9", buildDevice:"trona", buildProduct:"trona", buildHardware:"trona", buildId:"PS7312.3016N", tablet:true, width:"1920", height:"1200", density:"224"},
        {key:"firehd10plus-2021", name:"Fire HD 10 Plus (2021) KFTRPWI", deviceType:"A2N49KXGVA18AR", model:"KFTRPWI", apiLevel:"28", releaseVersion:"9", buildDevice:"trona", buildProduct:"trona", buildHardware:"trona", buildId:"PS7312.3016N", tablet:true, width:"1920", height:"1200", density:"224"},
        {key:"firehd8plus-2020", name:"Fire HD 8 Plus (2020) KFONWI", deviceType:"AVU7CPPF2ZRAS", model:"KFONWI", apiLevel:"28", releaseVersion:"9", buildDevice:"onyx", buildProduct:"onyx", buildHardware:"onyx", buildId:"PS7312.3016N", tablet:true, width:"1280", height:"800", density:"189"}
    ];
    function coherentProfile(candidate){
        var base=JSON.parse(args.profile.specs||"{}"); base.deviceType=candidate.deviceType; base.deviceInfo=base.deviceInfo||{}; var d=base.deviceInfo;
        d.deviceType=candidate.deviceType; d.model=candidate.model; d.APILevel=candidate.apiLevel; d.releaseVersion=candidate.releaseVersion;
        d["build.device"]=candidate.buildDevice; d["build.product"]=candidate.buildProduct; d["build.hardware"]=candidate.buildHardware; d["build.board"]=candidate.buildDevice; d["build.id"]=candidate.buildId; d.display=candidate.buildId;
        if(candidate.key!=="historical-a3gfs") d["build.fingerprint"]="Amazon/"+candidate.buildProduct+"/"+candidate.buildDevice+":"+candidate.releaseVersion+"/"+candidate.buildId+"/candidate:user/amz-p,release-keys";
        if(candidate.tablet){
            d.cpuABI="arm64-v8a"; d["build.cpuABI2"]="armeabi-v7a"; d.openGlEsVersion="0x00030002";
            d.deviceDisplayPixelsWidth=candidate.width; d.deviceDisplayPixelsHeight=candidate.height; d["screenRealSize.width"]=candidate.width; d["screenRealSize.height"]=candidate.height; d["screenSize.width"]=candidate.width; d["screenSize.height"]=candidate.height;
            d.deviceDisplayXDpi=candidate.density; d.deviceDisplayYDpi=candidate.density; d.deviceDensityClassification=candidate.density; d.deviceTouchscreen="TOUCHSCREEN_FINGER";
            d.deviceScreenLayout=(parseInt(candidate.width,10)>=1800)?"SCREENLAYOUT_SIZE_XLARGE":"SCREENLAYOUT_SIZE_LARGE";
            d["android.hardware.screen.portrait"]="true"; d["android.hardware.screen.landscape"]="true"; d["android.hardware.touchscreen"]="true"; d["android.hardware.touchscreen.multitouch"]="true"; d["android.hardware.touchscreen.multitouch.distinct"]="true"; d["android.hardware.touchscreen.multitouch.jazzhand"]="true";
            d["android.hardware.camera"]="true"; d["android.hardware.camera.any"]="true"; d["android.hardware.camera.front"]="true"; d["android.hardware.camera.autofocus"]="false"; d["android.hardware.camera.flash"]="false";
            d["android.hardware.location"]="true"; d["android.hardware.location.network"]="true"; d["android.hardware.location.gps"]="false"; d["android.hardware.sensor.accelerometer"]="true"; d["android.hardware.telephony"]="false"; d["android.hardware.telephony.gsm"]="false";
            d.isPreloaded="true"; d.isRooted="false"; d.isEmulator="false"; d.capabilitiesCodeVersion="2.0";
        }
        return {key:"tablet-matrix-"+candidate.key,name:candidate.name,specs:JSON.stringify(base)};
    }
    var report={build:"0.5.33-fire-tablet-direct-mas-matrix-debug",startedAt:new Date().toISOString(),targetAsin:args.asin,targetVersion:String(args.version||"1"),controlAsin:"B00YPIFS3W",controlVersion:"0",baseProfileKey:args.profile.key,baseProfileName:args.profile.name,credentialStrategy:"main-auth-register-mac_dms-direct-to-MAS",candidates:candidates,results:[],jackpot:null};
    APKDebug.log("fireTabletDirectMasMatrix","START",{targetAsin:report.targetAsin,targetVersion:report.targetVersion,candidates:candidates.map(function(c){return {deviceType:c.deviceType,model:c.model,name:c.name};})});
    var originalDescriptor=args.savedDescriptor||"", originalCookie=args.savedCookie||"", i=0;
    var token=args.user&&args.user.device&&args.user.device.main_adp_token;
    var key=args.user&&args.user.device&&args.user.device.main_device_private_key;
    function finish(){BrowserStorage.set({appstore_device_descriptor_id:originalDescriptor,appstore_identity_x_cookie:originalCookie},function(){report.completedAt=new Date().toISOString();chrome.storage.local.set({apk_debug_last_associated_type_matrix:report},function(){APKDebug.log("fireTabletDirectMasMatrix","COMPLETE",{results:report.results.length,jackpot:report.jackpot});callback(report);});});}
    function parseMas(xhr){var out={status:"success",deviceDescriptorPresent:false,xCookiePresent:false,descriptor:"",xCookie:""};try{var m=JSON.parse(xhr.responseText||"{}");out.descriptor=m.deviceDescriptorId||"";var arr=m.identityTokens||[];for(var j=0;j<arr.length;j++){if(arr[j]&&arr[j].name==="x-cookie"&&arr[j].value){out.xCookie=arr[j].value;break;}}out.deviceDescriptorPresent=!!out.descriptor;out.xCookiePresent=!!out.xCookie;}catch(e){out.parseError=String(e);}return out;}
    function oneDownload(c,label,asin,version,descriptor,xCookie,profile,variant,done){
        var headers={}; if(variant.descriptor&&descriptor)headers["x-amzn-device-descriptor-id"]=descriptor; if(variant.cookie&&xCookie)headers["x-cookie"]=xCookie;
        var pi={profileKey:profile.key,profileName:profile.name,model:c.model,appstoreProfileDeviceType:c.deviceType,authDeviceType:"A1MPSLFC7L5AFK",historicalAssociatedDeviceType:"not-used"};
        AppstoreAPI.getDownloadUrl(JSON.stringify({asin:asin,hasExpiry:true,version:String(version)}),token,key,function(r){done({status:"success",packageName:r.packageName||null,androidVersionCode:r.androidVersionCode||null,asinVersionInfo:r.asinVersionInfo||null});},function(type,message){done({status:"error",errorType:type||"Unknown",message:message||""});},pi,{name:"direct-mas-"+variant.key,debugStage:"getDownloadUrl.fire-tablet-direct-mas."+label+"."+variant.key,extraHeaders:headers,credentialsMode:"omit",descriptorPresent:!!descriptor,xCookiePresent:!!xCookie,credentialModeLabel:"main-auth-register-mac_dms",firsAssociatedStage:"not-used"});
    }
    var variants=[{key:"baseline",descriptor:false,cookie:false},{key:"descriptor",descriptor:true,cookie:false},{key:"x-cookie",descriptor:false,cookie:true},{key:"descriptor-x-cookie",descriptor:true,cookie:true}];
    function next(){
        if(report.jackpot||i>=candidates.length){finish();return;}
        var c=candidates[i++],row={index:i-1,key:c.key,name:c.name,deviceType:c.deviceType,model:c.model,startedAt:new Date().toISOString(),deliveryVariants:[]};report.results.push(row);
        var profile=coherentProfile(c),parsed=JSON.parse(profile.specs),d=parsed.deviceInfo||{};
        row.profile={outerDeviceType:parsed.deviceType,nestedDeviceType:d.deviceType,model:d.model,apiLevel:d.APILevel,releaseVersion:d.releaseVersion,cpuABI:d.cpuABI,width:d.deviceDisplayPixelsWidth,height:d.deviceDisplayPixelsHeight,density:d.deviceDensityClassification,buildDevice:d["build.device"],buildProduct:d["build.product"],touchscreen:d["android.hardware.touchscreen"]};
        APKDebug.log("fireTabletDirectMasMatrix","CANDIDATE_START",{index:row.index,total:candidates.length,key:c.key,deviceType:c.deviceType,model:c.model});
        AppstoreAPI.appstoreOnlyRegisterDevice(profile.specs,token,key,function(xhr){
            var mas=parseMas(xhr); row.mas={status:"success",deviceDescriptorPresent:mas.deviceDescriptorPresent,xCookiePresent:mas.xCookiePresent};
            APKDebug.log("fireTabletDirectMasMatrix","MAS_SUCCESS",{key:c.key,deviceType:c.deviceType,model:c.model,deviceDescriptorPresent:mas.deviceDescriptorPresent,xCookiePresent:mas.xCookiePresent});
            oneDownload(c,c.key+".control",report.controlAsin,report.controlVersion,mas.descriptor,mas.xCookie,profile,variants[3],function(control){row.control=control;var vi=0;
                function nextVariant(){if(vi>=variants.length){row.completedAt=new Date().toISOString();row.result="target-failed";APKDebug.log("fireTabletDirectMasMatrix","CANDIDATE_COMPLETE",{key:c.key,controlStatus:control.status,targetVariants:row.deliveryVariants.map(function(x){return {variant:x.variant,status:x.target.status,error:x.target.errorType||null};})});next();return;}
                    var v=variants[vi++];oneDownload(c,c.key+".target",report.targetAsin,report.targetVersion,mas.descriptor,mas.xCookie,profile,v,function(target){row.deliveryVariants.push({variant:v.key,target:target});if(target.status==="success"){row.target=target;row.result="target-success";row.completedAt=new Date().toISOString();report.jackpot={index:row.index,key:c.key,name:c.name,deviceType:c.deviceType,model:c.model,variant:v.key,packageName:target.packageName||null,androidVersionCode:target.androidVersionCode||null};APKDebug.log("fireTabletDirectMasMatrix","TARGET_SUCCESS_STOP",report.jackpot);finish();return;}nextVariant();});}
                nextVariant();
            });
        },function(type,message){row.mas={status:"error",errorType:type||"Unknown",message:message||""};row.result="mas-failed";row.completedAt=new Date().toISOString();APKDebug.log("fireTabletDirectMasMatrix","MAS_FAILED",{key:c.key,deviceType:c.deviceType,model:c.model,errorType:type||"Unknown",message:message||""});next();},true,"fireTabletDirectMasMatrix.mas."+c.key);
    }
    if(!token||!key){report.error={type:"MissingMainCredentials",message:"No stored main auth/register mac_dms credential pair."};finish();return;}
    next();
}

function runParamountCompatibilityProbe(args, callback) {
    var candidates = [
        {key:"firetv-stick-4k-aftmm",name:"Fire TV Stick 4K AFTMM (historical control)",deviceType:"A3GFS040JDOGQR",model:"AFTMM",apiLevel:"24",releaseVersion:"8.0",preserveKnownBuild:true,width:"1920",height:"1080",density:"320"},
        {key:"firetv-stick-4k-max-2",name:"Fire TV Stick 4K Max (2nd Gen) AFTKRT",deviceType:"A1WZKXFLI43K86",model:"AFTKRT",apiLevel:"30",releaseVersion:"11",width:"1920",height:"1080",density:"320"},
        {key:"firetv-stick-4k-max-1",name:"Fire TV Stick 4K Max (1st Gen) AFTKA",deviceType:"A3EVMLQTU6WL1W",model:"AFTKA",apiLevel:"28",releaseVersion:"9",width:"1920",height:"1080",density:"320"}
    ];
    var asin="B017250D16", packageName="com.cbs.ott";
    var version=String(args.version||"1630");
    var numericVersion=parseInt(version,10);
    var versionCandidates=[{key:"page-version",value:version},{key:"version-omitted",value:null},{key:"version-zero",value:"0"},{key:"version-one",value:"1"}];
    if(isFinite(numericVersion))[-1,1,-2,2,-5,5,-10,10,-25,25,-50,50,-100,100,-200,200].forEach(function(offset){var value=String(numericVersion+offset);if(parseInt(value,10)>0)versionCandidates.push({key:(offset<0?"minus-":"plus-")+Math.abs(offset),value:value});});
    var report={build:"0.5.39-paramount-fire-tv-version-resolver",asin:asin,packageName:packageName,requestedVersion:version,startedAt:new Date().toISOString(),authPath:"main auth/register mac_dms -> direct MAS appstoreOnlyRegisterDevice -> baseline getDownloadUrl",firsUsed:false,descriptorOrXCookieDeliveryVariantsUsed:false,amazonListingFinding:"Amazon's current B017250D16 listing explicitly says it works with Fire TV Voice Remote and that its version varies by device.",note:"The ASIN is retained. This probe tests omitted/default and nearby version identifiers across three existing Fire TV identities. No deviceType IDs or build fingerprints were invented.",versionCandidates:versionCandidates,tests:[],jackpot:null};
    var token=args.user&&args.user.device&&args.user.device.main_adp_token;
    var key=args.user&&args.user.device&&args.user.device.main_device_private_key;
    var originalDescriptor=args.savedDescriptor||"",originalCookie=args.savedCookie||"",i=0;
    function raw(details){return APKDebug.sanitize(details&&details.rawResponse!==undefined?details.rawResponse:"");}
    function publicProfile(c,d){return {key:c.key,name:c.name,deviceType:c.deviceType,model:c.model,apiLevel:c.apiLevel,releaseVersion:c.releaseVersion,cpuABI:d.cpuABI,cpuABI2:d["build.cpuABI2"],buildDevice:d["build.device"]||null,buildProduct:d["build.product"]||null,buildHardware:d["build.hardware"]||null,buildId:d["build.id"]||null,width:c.width,height:c.height,density:c.density};}
    function profileFor(c){
        var tvBase=Devices.PROFILES&&Devices.PROFILES["aftmm-a3gfs-clean"];
        var base=tvBase?JSON.parse(JSON.stringify(tvBase.specs)):JSON.parse(args.profile.specs||"{}"); var d=base.deviceInfo||(base.deviceInfo={});
        base.deviceType=c.deviceType; d.deviceType=c.deviceType; d.manufacturer="Amazon"; d.brand="Amazon"; d.model=c.model;
        d.APILevel=c.apiLevel; d.releaseVersion=c.releaseVersion;
        if(!c.preserveKnownBuild){delete d["build.device"];delete d["build.product"];delete d["build.hardware"];delete d["build.board"];delete d["build.id"];delete d.display;delete d["build.serial"];delete d["build.fingerprint"];}
        d.deviceDisplayPixelsWidth=c.width; d.deviceDisplayPixelsHeight=c.height; d["screenRealSize.width"]=c.width; d["screenRealSize.height"]=c.height; d["screenSize.width"]=c.width; d["screenSize.height"]=c.height;
        d.deviceDisplayXDpi=c.density; d.deviceDisplayYDpi=c.density; d.deviceDensityClassification=c.density; d.deviceScreenLayout="SCREENLAYOUT_SIZE_LARGE"; d.deviceTouchscreen="TOUCHSCREEN_NOTOUCH";
        d["android.hardware.screen.portrait"]="false"; d["android.hardware.screen.landscape"]="true"; d["android.hardware.touchscreen"]="false"; d["android.hardware.touchscreen.multitouch"]="false"; d["android.hardware.touchscreen.multitouch.distinct"]="false"; d["android.hardware.touchscreen.multitouch.jazzhand"]="false";
        d["android.hardware.camera"]="false"; d["android.hardware.camera.any"]="false"; d["android.hardware.camera.front"]="false"; d["android.hardware.telephony"]="false"; d["android.hardware.telephony.gsm"]="false"; d.isRooted="false"; d.isEmulator="false"; d.isPreloaded="true";
        return {key:"paramount-"+c.key,name:c.name,specs:JSON.stringify(base),deviceInfo:d};
    }
    function finish(){
        report.completedAt=new Date().toISOString();
        var restore={apk_debug_last_paramount_compatibility_probe:report,appstore_device_descriptor_id:originalDescriptor,appstore_identity_x_cookie:originalCookie};
        chrome.storage.local.set(restore,function(){APKDebug.log("paramountCompatibilityProbe","COMPLETE",{tests:report.tests.length,jackpot:report.jackpot});callback(report);});
    }
    function next(){
        if(i>=candidates.length){finish();return;}
        var c=candidates[i++],profile=profileFor(c),row={profile:publicProfile(c,profile.deviceInfo),registration:{status:"pending"},deliveries:[]}; report.tests.push(row);
        AppstoreAPI.appstoreOnlyRegisterDevice(profile.specs,token,key,function(xhr){
            var parsed={};try{parsed=JSON.parse(xhr.responseText||"{}");}catch(e){row.registration.parseError=String(e);}
            row.registration={status:"success",httpStatus:xhr.status||200,descriptorPresent:!!parsed.deviceDescriptorId,xCookiePresent:!!((parsed.identityTokens||[]).filter(function(t){return t&&t.name==="x-cookie"&&t.value;}).length),responseKeys:Object.keys(parsed).sort()};
            var profileInfo={key:profile.key,name:profile.name,model:c.model,deviceType:c.deviceType,appstoreProfileDeviceType:c.deviceType,authDeviceType:"A1MPSLFC7L5AFK",historicalAssociatedDeviceType:"not-used"};
            var vi=0;
            function nextVersion(){
                if(vi>=versionCandidates.length){next();return;}
                var candidate=versionCandidates[vi++],body={asin:asin,hasExpiry:true};if(candidate.value!==null)body.version=candidate.value;
                AppstoreAPI.getDownloadUrl(JSON.stringify(body),token,key,function(result){
                    var u=null;try{u=new URL(result.downloadUrl);}catch(_){}
                    var delivery={candidateKey:candidate.key,requestedVersion:candidate.value,status:"success",packageName:result.packageName||null,expectedPackageName:packageName,packageMatches:result.packageName===packageName,androidVersionCode:result.androidVersionCode||null,asinVersionInfo:result.asinVersionInfo||null,downloadUrlHost:u?u.host:null,downloadUrlPath:u?u.pathname:null};row.deliveries.push(delivery);
                    report.jackpot={profileKey:c.key,profileName:c.name,deviceType:c.deviceType,model:c.model,candidateKey:candidate.key,requestedVersion:candidate.value,packageName:result.packageName||null,androidVersionCode:result.androidVersionCode||null,asinVersionInfo:result.asinVersionInfo||null};
                    if(result.downloadUrl)BrowserDownloads.download(result.downloadUrl,"appstore-apk-downloader/fire-tv-version-probe/"+(result.packageName||packageName)+"-"+(candidate.value===null?"version-omitted":candidate.value)+".apk");
                    finish();
                },function(type,message,details){row.deliveries.push({candidateKey:candidate.key,requestedVersion:candidate.value,status:"error",errorType:type||"Unknown",message:message||"",httpStatus:details&&details.httpStatus||null,requestId:details&&details.requestId||null,rawResponse:raw(details)});nextVersion();},profileInfo,{name:"baseline",debugStage:"paramountCompatibilityProbe.delivery."+c.key+"."+candidate.key,extraHeaders:{},credentialsMode:"omit",descriptorPresent:false,xCookiePresent:false,credentialModeLabel:"main-auth-register-mac_dms",firsAssociatedStage:"not-used"});
            }
            nextVersion();
        },function(type,message,details){row.registration={status:"error",errorType:type||"Unknown",message:message||"",httpStatus:details&&details.httpStatus||null,requestId:details&&details.requestId||null,rawResponse:raw(details)};next();},true,"paramountCompatibilityProbe.registration."+c.key);
    }
    if(!token||!key){report.error={type:"MissingMainCredentials",message:"No stored main auth/register mac_dms credential pair."};finish();return;}
    next();
}

function runPostOrderBindingRetry(orderResult, callback) {
    var asin=(orderResult.pendingOrder&&orderResult.pendingOrder.asin)||orderResult.asin||"B017250D16";
    var version=(orderResult.pendingOrder&&orderResult.pendingOrder.appVersionNo)||"1630";
    var report={build:"0.5.40-paramount-order-binding-probe",asin:asin,packageName:"com.cbs.ott",version:String(version),startedAt:new Date().toISOString(),trigger:"successful Amazon Deliver app only result",authPath:"main auth/register mac_dms -> direct MAS Fire TV registration -> focused getDownloadUrl session-binding comparison",firsUsed:false,orderResult:APKDebug.sanitize(orderResult),registration:{status:"pending"},deliveries:[]};
    BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"],function(saved){
        var user=saved&&saved.user?saved.user:{};
        var token=user.device&&user.device.main_adp_token,key=user.device&&user.device.main_device_private_key;
        var originalDescriptor=saved.appstore_device_descriptor_id||"",originalCookie=saved.appstore_identity_x_cookie||"";
        function finish(){report.completedAt=new Date().toISOString();chrome.storage.local.set({apk_debug_last_order_binding_probe:report,appstore_device_descriptor_id:originalDescriptor,appstore_identity_x_cookie:originalCookie},function(){APKDebug.log("orderBindingProbe","COMPLETE",{registration:report.registration.status,deliveries:report.deliveries.map(function(d){return {variant:d.variant,status:d.status,errorType:d.errorType||null};})});if(callback)callback(report);});}
        if(!AppstoreUtils.isValidUser(user)||!token||!key){report.error={type:"NotLoggedIn",message:"Main mac_dms credentials are unavailable."};finish();return;}
        var source=Devices.PROFILES&&Devices.PROFILES["aftmm-a3gfs-clean"];
        if(!source){report.error={type:"MissingProfile",message:"The known AFTMM Fire TV profile is unavailable."};finish();return;}
        var profile={key:"paramount-firetv-aftmm-order-binding",name:"Fire TV Stick 4K AFTMM order-binding control",specs:JSON.stringify(source.specs)};
        AppstoreAPI.appstoreOnlyRegisterDevice(profile.specs,token,key,function(xhr){
            var parsed={};try{parsed=JSON.parse(xhr.responseText||"{}");}catch(e){report.registration.parseError=String(e);}
            var descriptor=parsed.deviceDescriptorId||"",xCookie="";(parsed.identityTokens||[]).forEach(function(t){if(t&&t.name==="x-cookie"&&t.value)xCookie=t.value;});
            report.registration={status:"success",httpStatus:xhr.status||200,profileKey:profile.key,model:"AFTMM",deviceType:"A3GFS040JDOGQR",descriptorPresent:!!descriptor,xCookiePresent:!!xCookie,responseKeys:Object.keys(parsed).sort()};
            var variants=[{key:"baseline",headers:{}},{key:"descriptor",headers:descriptor?{"x-amzn-device-descriptor-id":descriptor}:{}},{key:"x-cookie",headers:xCookie?{"x-cookie":xCookie}:{}},{key:"descriptor-x-cookie",headers:(function(){var h={};if(descriptor)h["x-amzn-device-descriptor-id"]=descriptor;if(xCookie)h["x-cookie"]=xCookie;return h;})()}],i=0;
            var profileInfo={key:profile.key,name:profile.name,model:"AFTMM",deviceType:"A3GFS040JDOGQR",appstoreProfileDeviceType:"A3GFS040JDOGQR",authDeviceType:"A1MPSLFC7L5AFK",historicalAssociatedDeviceType:"not-used"};
            function next(){
                if(i>=variants.length){finish();return;}
                var v=variants[i++];
                AppstoreAPI.getDownloadUrl(JSON.stringify({asin:asin,hasExpiry:true,version:String(version)}),token,key,function(result){
                    var u=null;try{u=new URL(result.downloadUrl);}catch(_){}
                    report.deliveries.push({variant:v.key,status:"success",packageName:result.packageName||null,androidVersionCode:result.androidVersionCode||null,asinVersionInfo:result.asinVersionInfo||null,downloadUrlHost:u?u.host:null,downloadUrlPath:u?u.pathname:null});
                    if(result.downloadUrl)BrowserDownloads.download(result.downloadUrl,"appstore-apk-downloader/order-binding-probe/"+(result.packageName||"com.cbs.ott")+"-"+v.key+"-"+version+".apk");next();
                },function(type,message,details){report.deliveries.push({variant:v.key,status:"error",errorType:type||"Unknown",message:message||"",httpStatus:details&&details.httpStatus||null,requestId:details&&details.requestId||null,rawResponse:APKDebug.sanitize(details&&details.rawResponse||"")});next();},profileInfo,{name:v.key,debugStage:"orderBindingProbe.delivery."+v.key,extraHeaders:v.headers,credentialsMode:"omit",descriptorPresent:!!v.headers["x-amzn-device-descriptor-id"],xCookiePresent:!!v.headers["x-cookie"],credentialModeLabel:"main-auth-register-mac_dms-post-order",firsAssociatedStage:"not-used"});
            }
            next();
        },function(type,message,details){report.registration={status:"error",errorType:type||"Unknown",message:message||"",httpStatus:details&&details.httpStatus||null,requestId:details&&details.requestId||null,rawResponse:APKDebug.sanitize(details&&details.rawResponse||"")};finish();},true,"orderBindingProbe.registration");
    });
}

function buildMasClientCookie(profile, descriptor, persona) {
    var parsed={}; try{parsed=JSON.parse(profile.specs||"{}");}catch(e){}
    var d=parsed.deviceInfo||{};
    var width=d["screenRealSize.width"]||d["screenSize.width"]||d.deviceDisplayPixelsWidth||"1920";
    var height=d["screenRealSize.height"]||d["screenSize.height"]||d.deviceDisplayPixelsHeight||"1080";
    var dt=d.deviceType||parsed.deviceType||"A3GFS040JDOGQR";
    var model=d.model||"AFTMM";
    var product=d["build.product"]||"mantis";
    var fingerprint=d["build.fingerprint"]||"";
    var manufacturer=d.manufacturer||"Amazon";
    if(persona==="historical-acer"){
        dt="A3GFS040JDOGQR"; model="A1-850"; product="a1850_ww_gen1"; manufacturer="Acer"; width="800"; height="1216";
        fingerprint="acer/a1850_ww_gen1/vespa8:4.4.4/KTU84P/1417433162:user/release-keys";
    }
    function enc(v){return encodeURIComponent(String(v||""));}
    return "dpi:1.5|w:"+width+"|h:"+height+"|xdpi:"+(d.deviceDisplayXDpi||"213")+"|ydpi:"+(d.deviceDisplayYDpi||"213")+
        "|deviceType:"+dt+"|cor:US|pfm:ATVPDKIKX0DER|layout:"+(d.screenLayoutRaw||"268435555")+
        "|deviceDescriptorId:"+(descriptor||"")+"|ref_encoded:device_model%3D"+enc(model)+"%3B|baseFont:23|phoneType:0|cloudLibrary:0|lang:en-US"+
        "|testDriveSdkVersion:1.0|carrier_encoded:"+enc(d.carrier||"unknown")+"|build_product_encoded:"+enc(product)+
        "|build_fingerprint_encoded:"+enc(fingerprint)+"|manufacturer_encoded:"+enc(manufacturer)+
        "|carrierBillingEligible:0|carrierBillingEnabled:0|androidTargetSdkVersion:"+(d.APILevel||"24")+"|androidApkInstallSource:UNKNOWN;";
}

function runMasClientPersonaProbe(asin, profile, descriptor, persona, callback) {
    var ruleId=91300;
    var url="https://mas-ssr.amazon.com/gp/masclient/dp/"+encodeURIComponent(asin);
    var ua = persona==="historical-acer" ? "Appstore/release-11.0004.790.6C_641000410 (Android/4.4.4/19/A1-850)" :
        "Appstore/release-64.7000.110.0C_647000110 (Android/"+((function(){var x={};try{x=JSON.parse(profile.specs||'{}')}catch(e){}return (x.deviceInfo&&x.deviceInfo.releaseVersion)||'8.0';})())+"/"+((function(){var x={};try{x=JSON.parse(profile.specs||'{}')}catch(e){}return (x.deviceInfo&&x.deviceInfo.APILevel)||'24';})())+"/"+profile.model+")";
    var cookie=buildMasClientCookie(profile,descriptor,persona);
    var headers=[
        {header:"user-agent",operation:"set",value:ua},
        {header:"accept",operation:"set",value:"application/json"},
        {header:"accept-language",operation:"set",value:"en-US"},
        {header:"x-requested-with",operation:"set",value:AppstoreUtils.APP_NAME},
        {header:"cookie",operation:"set",value:"masclient-device-info="+cookie}
    ];
    APKDebug.log("variantDiscovery."+persona,"DNR_INSTALL",{url:url,userAgent:ua,deviceDescriptorIdPresent:!!descriptor,cookieDeviceType:(cookie.match(/deviceType:([^|]+)/)||[])[1]||null});
    chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[ruleId],addRules:[{id:ruleId,priority:1,action:{type:"modifyHeaders",requestHeaders:headers},condition:{urlFilter:"||mas-ssr.amazon.com/gp/masclient/dp/",resourceTypes:["xmlhttprequest"]}}]},function(){
        var last=chrome.runtime.lastError;
        if(last){ callback({persona:persona,url:url,status:0,dnrError:last.message}); return; }
        fetch(url,{method:"GET",credentials:"omit",cache:"no-store"}).then(function(resp){return resp.text().then(function(text){
            var extracted=variantDiscoveryExtract(text||"");
            var rec={persona:persona,url:url,status:resp.status,contentType:resp.headers.get("content-type")||"",responsePreview:String(text||"").substring(0,12000),parsed:extracted.parsed,parseError:extracted.parseError||null,topLevelType:extracted.topLevelType,candidates:extracted.candidates,snippets:extracted.snippets};
            APKDebug.log("variantDiscovery."+persona,resp.ok?"HTTP_SUCCESS":"HTTP_ERROR",{status:rec.status,contentType:rec.contentType,parsed:rec.parsed,candidateCount:rec.candidates.length,snippetCount:rec.snippets.length,responsePreview:rec.responsePreview.substring(0,3000)});
            callback(rec);
        });}).catch(function(err){callback({persona:persona,url:url,status:0,networkError:String(err)});});
    });
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    var cmd = message.cmd;
    var data = message.data || {};

    if (cmd === "download") {
        /* v0.5.34 production candidate: use the exact path that succeeded in
         * the v0.5.33 matrix. Main auth/register mac_dms -> direct MAS
         * registration as KFRAWI/A1TD5Z1R8IWBHA -> baseline getDownloadUrl.
         */
        BrowserStorage.get(["user"], function(saved) {
            var user = saved && saved.user ? saved.user : {};
            if (!AppstoreUtils.isValidUser(user) || !user.device || !user.device.main_adp_token || !user.device.main_device_private_key) {
                APKDebug.log("download534", "BLOCKED", {reason:"NotLoggedInOrMissingMainCredentials"});
                sendResponse({error:{type:"NotLoggedIn",message:"Please log in to Amazon again."}});
                return;
            }

            var retailVersion = data && data.appVersionNo ? String(data.appVersionNo).trim() : "";
            var selectedVersion = retailVersion || "1";
            var token = user.device.main_adp_token;
            var key = user.device.main_device_private_key;

            Devices.getProfile(Devices.DEFAULT_MAS_PROFILE, function(profile) {
                var parsed={}; try { parsed=JSON.parse(profile.specs||"{}"); } catch(_) {}
                var di=parsed.deviceInfo||{};
                var profileInfo={
                    key:profile.key, name:profile.name,
                    deviceType:parsed.deviceType||di.deviceType||null,
                    model:di.model||null,
                    profileKey:profile.key, profileName:profile.name,
                    appstoreProfileDeviceType:parsed.deviceType||di.deviceType||null,
                    authDeviceType:"A1MPSLFC7L5AFK",
                    historicalAssociatedDeviceType:"not-used"
                };

                APKDebug.log("download534", "MAS_REGISTER_START", {
                    asin:data.asin, version:selectedVersion,
                    profileKey:profile.key, profileName:profile.name,
                    deviceType:profileInfo.deviceType, model:profileInfo.model,
                    credentialStrategy:"main-auth-register-mac_dms-direct-to-MAS"
                });

                AppstoreAPI.appstoreOnlyRegisterDevice(
                    profile.specs, token, key,
                    function(xhr) {
                        var descriptor="", xCookie="";
                        try {
                            var m=JSON.parse(xhr.responseText||"{}");
                            descriptor=m.deviceDescriptorId||"";
                            (m.identityTokens||[]).forEach(function(t){if(t&&t.name==="x-cookie"&&t.value)xCookie=t.value;});
                        } catch(_) {}

                        // Persist the proven profile as the active selection and keep user metadata coherent.
                        user.device.mas_profile_key=profile.key;
                        user.device.mas_profile_name=profile.name;
                        user.device.mas_profile_device_type=profileInfo.deviceType;
                        user.device.mas_profile_model=profileInfo.model;
                        user.device.delivery_credential_mode="main";
                        user.device.main_device_descriptor_id=descriptor;
                        user.device.main_identity_x_cookie=xCookie;
                        var store={user:user,apk_mas_profile:profile.key};
                        if(descriptor) store.appstore_device_descriptor_id=descriptor;
                        if(xCookie) store.appstore_identity_x_cookie=xCookie;
                        BrowserStorage.set(store);

                        APKDebug.log("download534", "MAS_REGISTER_SUCCESS", {
                            deviceDescriptorPresent:!!descriptor, xCookiePresent:!!xCookie,
                            deviceType:profileInfo.deviceType, model:profileInfo.model
                        });

                        var request=JSON.stringify({asin:data.asin,hasExpiry:true,version:selectedVersion});
                        AppstoreAPI.getDownloadUrl(
                            request, token, key,
                            function(result) {
                                var suffix=(result.asinVersionInfo&&result.asinVersionInfo.version)||result.version||result.versionCode||selectedVersion||"unknown";
                                var filename="appstore-apk-downloader/"+result.packageName+"-"+suffix+".apk";
                                APKDebug.log("download534", "DOWNLOAD_URL_SUCCESS", {
                                    asin:data.asin, packageName:result.packageName||null,
                                    androidVersionCode:result.androidVersionCode||null,
                                    asinVersionInfo:result.asinVersionInfo||null,
                                    variant:"baseline", profileKey:profile.key
                                });
                                BrowserDownloads.download(result.downloadUrl,filename);
                                sendResponse({success:true,version:selectedVersion,variant:"baseline",profileKey:profile.key});
                                ZAnalytics.trackEvent(["download","app",result.packageName+"|"+data.asin]);
                            },
                            function(type,message) {
                                APKDebug.log("download534", "DOWNLOAD_URL_FAILED", {
                                    asin:data.asin,errorType:type||"Unknown",message:message||"",
                                    version:selectedVersion,profileKey:profile.key
                                });
                                sendResponse({error:{type:type||"Unknown",message:message||""}});
                            },
                            profileInfo,
                            {name:"baseline",debugStage:"getDownloadUrl.v0534.baseline",extraHeaders:{},credentialsMode:"omit",descriptorPresent:!!descriptor,xCookiePresent:!!xCookie,credentialModeLabel:"main-auth-register-mac_dms",firsAssociatedStage:"not-used"}
                        );
                    },
                    function(type,message) {
                        APKDebug.log("download534", "MAS_REGISTER_FAILED", {errorType:type||"Unknown",message:message||"",profileKey:profile.key});
                        sendResponse({error:{type:type||"Unknown",message:message||"MAS registration failed."}});
                    },
                    true,
                    "download534.appstoreOnlyRegisterDevice"
                );
            });
        });
        return true;
    }


    if (cmd === "runParamountCompatibilityProbe") {
        BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"],function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:"Please log in to Amazon first."}});return;}
            Devices.getProfile(Devices.DEFAULT_MAS_PROFILE,function(profile){
                runParamountCompatibilityProbe({user:user,profile:profile,version:data.appVersionNo||"1630",savedDescriptor:saved.appstore_device_descriptor_id||"",savedCookie:saved.appstore_identity_x_cookie||""},function(report){sendResponse(report.error?{error:report.error,report:report}:{success:true,report:report});});
            });
        });
        return true;
    }

    if (cmd === "runVersionSweep") {
        BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"],function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:""}});return;}
            var deliveryMode=(user.device&&user.device.delivery_credential_mode)||"main";
            var useAssociated=deliveryMode==="associated"&&!!user.device.associated_adp_token&&!!user.device.associated_device_private_key;
            var token=useAssociated?user.device.associated_adp_token:user.device.main_adp_token;
            var key=useAssociated?user.device.associated_device_private_key:user.device.main_device_private_key;
            var descriptor=useAssociated?(user.device.associated_device_descriptor_id||saved.appstore_device_descriptor_id||""):(user.device.main_device_descriptor_id||saved.appstore_device_descriptor_id||"");
            var xCookie=useAssociated?(user.device.associated_identity_x_cookie||saved.appstore_identity_x_cookie||""):(user.device.main_identity_x_cookie||saved.appstore_identity_x_cookie||"");
            var profileKey=user.device.mas_profile_key||Devices.DEFAULT_MAS_PROFILE;
            Devices.getProfile(profileKey,function(profile){
                var profileInfo={key:user.device.mas_profile_key||profile.key||null,name:user.device.mas_profile_name||profile.name||null,deviceType:user.device.mas_profile_device_type||null,model:user.device.mas_profile_model||null};
                runDownloadVersionSweep({asin:data.asin,retailVersion:data.appVersionNo||"",activeToken:token,activeKey:key,profileInfo:profileInfo,useAssociated:useAssociated,descriptor:descriptor,xCookie:xCookie},function(hit,report){
                    sendResponse({success:true,found:!!hit,version:hit&&hit.version||null,report:report});
                });
            });
        });
        return true;
    }


    if (cmd === "runModelCompatibilityMatrix") {
        BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"],function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:"Log in first."}});return;}
            Devices.getProfile("aftmm-a3gfs-clean",function(profile){
                runModelCompatibilityMatrix({asin:data.asin,version:data.appVersionNo||"1",user:user,profile:profile,savedDescriptor:saved.appstore_device_descriptor_id||"",savedCookie:saved.appstore_identity_x_cookie||""},function(report){sendResponse({success:true,report:report});});
            });
        });
        return true;
    }
    if (cmd === "clearModelCompatibilityMatrix") { chrome.storage.local.remove("apk_debug_last_model_compatibility_matrix",function(){sendResponse({success:true});}); return true; }

    if (cmd === "runCapabilitySensitivityMatrix") {
        BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"],function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:"Log in first."}});return;}
            Devices.getProfile("aftmm-a3gfs-clean",function(profile){
                runCapabilitySensitivityMatrix({asin:data.asin,version:data.appVersionNo||"1",user:user,profile:profile,savedDescriptor:saved.appstore_device_descriptor_id||"",savedCookie:saved.appstore_identity_x_cookie||""},function(report){sendResponse({success:true,report:report});});
            });
        });
        return true;
    }
    if (cmd === "clearCapabilitySensitivityMatrix") { chrome.storage.local.remove("apk_debug_last_capability_sensitivity_matrix",function(){sendResponse({success:true});}); return true; }

    if (cmd === "runAssociatedDeviceTypeMatrix") {
        BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"],function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:"Log in first."}});return;}
            var profileKey=user.device.mas_profile_key||Devices.DEFAULT_MAS_PROFILE;
            Devices.getProfile(profileKey,function(profile){
                var profileInfo={key:profile.key||profileKey,name:profile.name||null,deviceType:user.device.mas_profile_device_type||null,model:user.device.mas_profile_model||null};
                runAssociatedDeviceTypeMatrix({asin:data.asin,version:data.appVersionNo||"1",user:user,profile:profile,profileInfo:profileInfo,savedDescriptor:saved.appstore_device_descriptor_id||"",savedCookie:saved.appstore_identity_x_cookie||""},function(report){sendResponse({success:true,report:report});});
            });
        });
        return true;
    }
    if (cmd === "clearAssociatedDeviceTypeMatrix") { chrome.storage.local.remove("apk_debug_last_associated_type_matrix",function(){sendResponse({success:true});}); return true; }

    if (cmd === "runDeviceAccountDeliveryMatrix") {
        BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"],function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:""}});return;}
            var deliveryMode=(user.device&&user.device.delivery_credential_mode)||"main";
            var useAssociated=deliveryMode==="associated"&&!!user.device.associated_adp_token&&!!user.device.associated_device_private_key;
            var token=useAssociated?user.device.associated_adp_token:user.device.main_adp_token;
            var key=useAssociated?user.device.associated_device_private_key:user.device.main_device_private_key;
            var descriptor=useAssociated?(user.device.associated_device_descriptor_id||saved.appstore_device_descriptor_id||""):(user.device.main_device_descriptor_id||saved.appstore_device_descriptor_id||"");
            var xCookie=useAssociated?(user.device.associated_identity_x_cookie||saved.appstore_identity_x_cookie||""):(user.device.main_identity_x_cookie||saved.appstore_identity_x_cookie||"");
            var profileKey=user.device.mas_profile_key||Devices.DEFAULT_MAS_PROFILE;
            Devices.getProfile(profileKey,function(profile){
                var profileInfo={key:user.device.mas_profile_key||profile.key||null,name:user.device.mas_profile_name||profile.name||null,deviceType:user.device.mas_profile_device_type||null,model:user.device.mas_profile_model||null};
                runDeviceAccountDeliveryMatrix({asin:data.asin,version:data.appVersionNo||"1",deviceAccountID:data.deviceAccountID||null,activeToken:token,activeKey:key,profileInfo:profileInfo,profileSpecs:profile.specs,useAssociated:useAssociated,descriptor:descriptor,xCookie:xCookie},function(hit,report){sendResponse({success:true,found:!!hit,variant:hit&&hit.variant||null,report:report});});
            });
        });
        return true;
    }
    if (cmd === "clearDeviceAccountDeliveryMatrix") { chrome.storage.local.remove("apk_debug_last_device_account_matrix",function(){sendResponse({success:true});}); return true; }

    if (cmd === "clearVersionSweep") {
        chrome.storage.local.remove("apk_debug_last_version_sweep",function(){sendResponse({success:true});});
        return true;
    }


    if (cmd === "applyMasProfile") {
        BrowserStorage.get("user", function(saved) {
            var user=saved && saved.user ? saved.user : {};
            if (!AppstoreUtils.isValidUser(user)) { sendResponse({error:{type:"NotLoggedIn",message:"Log in with the working auth identity first."}}); return; }
            var key=data.profileKey || Devices.DEFAULT_MAS_PROFILE;
            Devices.getProfile(key,function(profile){
                var _profileParsed={}; try{_profileParsed=JSON.parse(profile.specs);}catch(_e){}
                APKDebug.log("masRegistrationMatrix","APPLY_START",{key:profile.key,name:profile.name,outerDeviceType:_profileParsed.deviceType||null,nestedDeviceType:_profileParsed.deviceInfo&&_profileParsed.deviceInfo.deviceType||null,model:_profileParsed.deviceInfo&&_profileParsed.deviceInfo.model||null,apiLevel:_profileParsed.deviceInfo&&_profileParsed.deviceInfo.APILevel||null,buildFingerprint:_profileParsed.deviceInfo&&_profileParsed.deviceInfo["build.fingerprint"]||null,isRooted:_profileParsed.deviceInfo&&_profileParsed.deviceInfo.isRooted||null});
                AppstoreAPI.appstoreOnlyRegisterDevice(profile.specs,user.device.main_adp_token,user.device.main_device_private_key,function(){
                    var parsed={}; try{parsed=JSON.parse(profile.specs);}catch(e){}
                    user.device.mas_profile_key=profile.key; user.device.mas_profile_name=profile.name;
                    user.device.mas_profile_device_type=parsed.deviceType || (parsed.deviceInfo && parsed.deviceInfo.deviceType) || null;
                    user.device.mas_profile_model=parsed.deviceInfo && parsed.deviceInfo.model || null;
                    BrowserStorage.get(["appstore_device_descriptor_id","appstore_identity_x_cookie"],function(bindings){
                        user.device.main_device_descriptor_id=(bindings&&bindings.appstore_device_descriptor_id)||user.device.main_device_descriptor_id||"";
                        user.device.main_identity_x_cookie=(bindings&&bindings.appstore_identity_x_cookie)||user.device.main_identity_x_cookie||"";
                        BrowserStorage.set({user:user},function(){
                            APKDebug.log("masRegistrationMatrix","APPLY_SUCCESS",{key:profile.key,name:profile.name,outerDeviceType:parsed.deviceType||null,nestedDeviceType:parsed.deviceInfo&&parsed.deviceInfo.deviceType||null,model:user.device.mas_profile_model,deviceDescriptorStored:!!user.device.main_device_descriptor_id,credentialPath:"main"});
                            sendResponse({success:true,profileKey:profile.key,profileName:profile.name});
                        });
                    });
                },function(type,message){ APKDebug.log("masRegistrationMatrix","APPLY_ERROR",{key:profile.key,name:profile.name,errorType:type||"Unknown",message:message||""}); sendResponse({error:{type:type||"Unknown",message:message||""}}); },true,"masProfile.appstoreOnlyRegisterDevice");
            });
        });
        return true;
    }

    if (cmd === "createAssociatedDeliveryIdentity") {
        function persistCheckpoint(step, details) {
            var rec={time:new Date().toISOString(),step:step,details:details||{}};
            try { chrome.storage.local.set({apk_debug_delivery_checkpoint:rec}); } catch(_) {}
            try { APKDebug.log("deliveryIdentity.runtime", step, details||{}); } catch(_) {}
        }
        persistCheckpoint("MESSAGE_HANDLER_ENTER", {cmd:cmd});
        try {
            BrowserStorage.get(["user","appstore_device_descriptor_id","appstore_identity_x_cookie"], function(saved) {
                persistCheckpoint("STORAGE_CALLBACK_ENTER", {savedUserPresent:!!(saved&&saved.user)});
                try {
                    var user=saved && saved.user ? saved.user : {};
                    if (!AppstoreUtils.isValidUser(user) || !user.device || !user.device.main_adp_token || !user.device.main_device_private_key) {
                        APKDebug.log("deliveryIdentity", "BLOCKED", {reason:"NoWorkingMainSession"});
                        persistCheckpoint("BLOCKED_NO_MAIN_SESSION", {});
                        sendResponse({error:{type:"NotLoggedIn",message:"Log in with the known-working main identity first."}});
                        return;
                    }
                    user.device.main_device_descriptor_id = user.device.main_device_descriptor_id || (saved.appstore_device_descriptor_id || "");
                    user.device.main_identity_x_cookie = user.device.main_identity_x_cookie || (saved.appstore_identity_x_cookie || "");
                    var profileKey=data.profileKey || user.device.mas_profile_key || Devices.DEFAULT_MAS_PROFILE;
                    persistCheckpoint("PROFILE_LOOKUP_START", {profileKey:profileKey});
                    Devices.getProfile(profileKey,function(profile){
                        persistCheckpoint("PROFILE_CALLBACK_ENTER", {profilePresent:!!profile,profileKey:profile&&profile.key||profileKey});
                        try {
                            APKDebug.log("deliveryIdentity", "START", {
                                associatedDeviceType:AppstoreUtils.DEVICE_TYPE_ASSOCIATED,
                                profileKey:profile.key,
                                profileName:profile.name,
                                mainCredentialPreserved:true,
                                experiment:"FIRS associated ADP credentials -> MAS registration -> selectable getDownloadUrl credential path"
                            });
                            persistCheckpoint("AFTER_START_LOG", {registerAssociatedDeviceType:typeof(AppstoreAPI&&AppstoreAPI.registerAssociatedDevice)});
                            function fail(type,message,stage){
                                APKDebug.log("deliveryIdentity", "FAILED", {stage:stage||"unknown",errorType:type||"Unknown",message:message||""});
                                persistCheckpoint("FAIL", {stage:stage||"unknown",errorType:type||"Unknown",message:message||""});
                                BrowserStorage.set({user:user},function(){sendResponse({error:{type:type||"Unknown",message:message||"",stage:stage||"unknown"}});});
                            }
                            function registerWithMas(assoc, firsAuthScheme){
                                persistCheckpoint("REGISTER_WITH_MAS_ENTER", {authScheme:firsAuthScheme,assocPresent:!!assoc});
                                if (!assoc || !assoc.adp_token || !assoc.device_private_key) { fail("IncompleteAssociatedCredentials","FIRS did not return an ADP token/private key pair.","firs"); return; }
                                user.device.associated_adp_token=assoc.adp_token;
                                user.device.associated_device_private_key=assoc.device_private_key;
                                user.device.associated_device_type=AppstoreUtils.DEVICE_TYPE_ASSOCIATED;
                                user.device.associated_firs_auth_scheme=firsAuthScheme;
                                APKDebug.log("deliveryIdentity", "FIRS_ACCEPTED", {associatedDeviceType:AppstoreUtils.DEVICE_TYPE_ASSOCIATED,authScheme:firsAuthScheme,adpTokenPresent:true,privateKeyPresent:true});
                                AppstoreAPI.appstoreOnlyRegisterDevice(profile.specs,assoc.adp_token,assoc.device_private_key,function(){
                                    BrowserStorage.get(["appstore_device_descriptor_id","appstore_identity_x_cookie"],function(bindings){
                                        var parsed={}; try{parsed=JSON.parse(profile.specs);}catch(e){}
                                        user.device.associated_device_descriptor_id=(bindings&&bindings.appstore_device_descriptor_id)||"";
                                        user.device.associated_identity_x_cookie=(bindings&&bindings.appstore_identity_x_cookie)||"";
                                        user.device.associated_mas_profile_key=profile.key;
                                        user.device.associated_mas_profile_name=profile.name;
                                        user.device.associated_mas_profile_device_type=parsed.deviceType || (parsed.deviceInfo&&parsed.deviceInfo.deviceType) || null;
                                        user.device.delivery_credential_mode="associated";
                                        BrowserStorage.set({user:user},function(){
                                            APKDebug.log("deliveryIdentity", "ASSOCIATED_MAS_ACCEPTED", {
                                                profileKey:profile.key,profileName:profile.name,
                                                associatedDeviceType:AppstoreUtils.DEVICE_TYPE_ASSOCIATED,
                                                deviceDescriptorStored:!!user.device.associated_device_descriptor_id,
                                                xCookieStored:!!user.device.associated_identity_x_cookie,
                                                activeDownloadCredential:"associated"
                                            });
                                            persistCheckpoint("ASSOCIATED_MAS_ACCEPTED", {profileKey:profile.key});
                                            sendResponse({success:true,profileKey:profile.key,profileName:profile.name,firsAuthScheme:firsAuthScheme,activeMode:"associated"});
                                        });
                                    });
                                },function(type,message){fail(type,message,"associated-mas");},true,"deliveryIdentity.associatedMAS");
                            }
                            function callFirsPromise(attempt, legacyAuth) {
                                var scheme=legacyAuth?"legacy-adp":"standard-adp";
                                var timeoutMs=18000;
                                persistCheckpoint("FIRS_CALL_PREPARE", {attempt:attempt,authScheme:scheme,timeoutMs:timeoutMs});
                                APKDebug.log("deliveryIdentity", "FIRS_ATTEMPT", {attempt:attempt,authScheme:scheme,associatedDeviceType:AppstoreUtils.DEVICE_TYPE_ASSOCIATED});
                                persistCheckpoint("FIRS_FUNCTION_PRESENT", {attempt:attempt,authScheme:scheme,type:typeof AppstoreAPI.registerAssociatedDevice});
                                if (!AppstoreAPI || typeof AppstoreAPI.registerAssociatedDevice !== "function") {
                                    var missing=new Error("AppstoreAPI.registerAssociatedDevice is not available");
                                    persistCheckpoint("FIRS_FUNCTION_MISSING", {attempt:attempt,authScheme:scheme});
                                    if (globalThis.recordRuntimeFault) globalThis.recordRuntimeFault("FIRS_FUNCTION_MISSING", missing, {attempt:attempt,authScheme:scheme});
                                    return Promise.reject({type:"MissingFunction",message:missing.message});
                                }
                                return new Promise(function(resolve,reject){
                                    var settled=false;
                                    var timer=setTimeout(function(){
                                        if (settled) return;
                                        settled=true;
                                        APKDebug.log("deliveryIdentity", "FIRS_CALLBACK_TIMEOUT", {attempt:attempt,authScheme:scheme,timeoutMs:timeoutMs});
                                        persistCheckpoint("FIRS_CALLBACK_TIMEOUT", {attempt:attempt,authScheme:scheme,timeoutMs:timeoutMs});
                                        reject({type:"CallbackTimeout",message:"registerAssociatedDevice callback did not fire within "+timeoutMs+" ms"});
                                    },timeoutMs);
                                    function finishSuccess(u,assoc){
                                        if (settled) return;
                                        settled=true;
                                        clearTimeout(timer);
                                        persistCheckpoint("FIRS_CALLBACK_SUCCESS", {attempt:attempt,authScheme:scheme,associatedCredentialPresent:!!(assoc&&assoc.adp_token&&assoc.device_private_key)});
                                        APKDebug.log("deliveryIdentity", "FIRS_CALLBACK_SUCCESS", {attempt:attempt,authScheme:scheme,associatedCredentialPresent:!!(assoc&&assoc.adp_token&&assoc.device_private_key)});
                                        resolve({user:u,assoc:assoc});
                                    }
                                    function finishError(type,message){
                                        if (settled) return;
                                        settled=true;
                                        clearTimeout(timer);
                                        persistCheckpoint("FIRS_CALLBACK_ERROR", {attempt:attempt,authScheme:scheme,errorType:type||"Unknown",message:message||""});
                                        APKDebug.log("deliveryIdentity", "FIRS_CALLBACK_ERROR", {attempt:attempt,authScheme:scheme,errorType:type||"Unknown",message:message||""});
                                        reject({type:type||"Unknown",message:message||""});
                                    }
                                    try {
                                        persistCheckpoint("FIRS_CALL_ENTER", {attempt:attempt,authScheme:scheme});
                                        var ret=AppstoreAPI.registerAssociatedDevice(user,finishSuccess,finishError,{legacyAuth:legacyAuth,debugStage:"deliveryIdentity.firs."+(legacyAuth?"legacy":"standard")});
                                        persistCheckpoint("FIRS_CALL_RETURNED", {attempt:attempt,authScheme:scheme,returnType:typeof ret,callbackBridgeActive:true});
                                        APKDebug.log("deliveryIdentity", "FIRS_CALLBACK_BRIDGE_WAIT", {attempt:attempt,authScheme:scheme,returnType:typeof ret,timeoutMs:timeoutMs});
                                    } catch (err) {
                                        if (!settled) {
                                            settled=true;
                                            clearTimeout(timer);
                                        }
                                        var msg=String(err&&err.message?err.message:err);
                                        persistCheckpoint("FIRS_CALL_SYNC_ERROR", {attempt:attempt,authScheme:scheme,message:msg,stack:err&&err.stack?String(err.stack).substring(0,8000):""});
                                        if (globalThis.recordRuntimeFault) globalThis.recordRuntimeFault("FIRS_CALL_SYNC_ERROR", err, {attempt:attempt,authScheme:scheme});
                                        reject({type:"SynchronousError",message:msg});
                                    }
                                });
                            }
                            persistCheckpoint("BEFORE_STANDARD_FIRS_CALL", {});
                            callFirsPromise(1,false).then(function(result){
                                registerWithMas(result.assoc,"standard-adp");
                            }).catch(function(firstErr){
                                var type=firstErr&&firstErr.type||"Unknown";
                                var message=firstErr&&firstErr.message||"";
                                APKDebug.log("deliveryIdentity", "FIRS_ATTEMPT_FAILED", {attempt:1,authScheme:"standard-adp",errorType:type,message:message});
                                persistCheckpoint("BEFORE_LEGACY_FIRS_CALL", {previousErrorType:type});
                                return callFirsPromise(2,true).then(function(result2){
                                    registerWithMas(result2.assoc,"legacy-adp");
                                }).catch(function(secondErr){
                                    var type2=secondErr&&secondErr.type||"Unknown";
                                    var message2=secondErr&&secondErr.message||"";
                                    APKDebug.log("deliveryIdentity", "FIRS_ATTEMPT_FAILED", {attempt:2,authScheme:"legacy-adp",errorType:type2,message:message2});
                                    fail(type2||type,message2||message,"firs-both-auth-schemes");
                                });
                            });
                        } catch (err) {
                            var msg=String(err&&err.message?err.message:err);
                            persistCheckpoint("PROFILE_CALLBACK_SYNC_ERROR", {message:msg,stack:err&&err.stack?String(err.stack).substring(0,8000):""});
                            if (globalThis.recordRuntimeFault) globalThis.recordRuntimeFault("PROFILE_CALLBACK_SYNC_ERROR", err, {profileKey:profileKey});
                            sendResponse({error:{type:"RuntimeError",message:msg,stage:"profile-callback"}});
                        }
                    });
                } catch (err) {
                    var msg=String(err&&err.message?err.message:err);
                    persistCheckpoint("STORAGE_CALLBACK_SYNC_ERROR", {message:msg,stack:err&&err.stack?String(err.stack).substring(0,8000):""});
                    if (globalThis.recordRuntimeFault) globalThis.recordRuntimeFault("STORAGE_CALLBACK_SYNC_ERROR", err, {});
                    sendResponse({error:{type:"RuntimeError",message:msg,stage:"storage-callback"}});
                }
            });
        } catch (err) {
            var msg=String(err&&err.message?err.message:err);
            persistCheckpoint("MESSAGE_HANDLER_SYNC_ERROR", {message:msg,stack:err&&err.stack?String(err.stack).substring(0,8000):""});
            if (globalThis.recordRuntimeFault) globalThis.recordRuntimeFault("MESSAGE_HANDLER_SYNC_ERROR", err, {});
            sendResponse({error:{type:"RuntimeError",message:msg,stage:"message-handler"}});
        }
        return true;
    }

    if (cmd === "logClientDiagnostic") {
        var stage=(data&&data.stage)||"client";
        var action=(data&&data.action)||"INFO";
        APKDebug.log(stage,action,(data&&data.details)||{});
        sendResponse({success:true});
        return;
    }

    if (cmd === "setDeliveryCredentialMode") {
        BrowserStorage.get("user",function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:"Log in first."}});return;}
            var mode=data.mode==="associated"?"associated":"main";
            if(mode==="associated" && (!user.device.associated_adp_token || !user.device.associated_device_private_key)){
                sendResponse({error:{type:"NoAssociatedCredentials",message:"Create an associated delivery identity first."}});return;
            }
            user.device.delivery_credential_mode=mode;
            BrowserStorage.set({user:user},function(){APKDebug.log("deliveryIdentity","MODE_SELECTED",{mode:mode});sendResponse({success:true,mode:mode});});
        });
        return true;
    }

    if (cmd === "getDeliveryIdentityStatus") {
        BrowserStorage.get("user",function(saved){
            var user=saved&&saved.user?saved.user:{};
            var d=user.device||{};
            sendResponse({success:true,status:{
                mode:d.delivery_credential_mode||"main",
                mainCredentialsPresent:!!(d.main_adp_token&&d.main_device_private_key),
                associatedCredentialsPresent:!!(d.associated_adp_token&&d.associated_device_private_key),
                associatedDescriptorPresent:!!d.associated_device_descriptor_id,
                associatedXCookiePresent:!!d.associated_identity_x_cookie,
                associatedFirsAuthScheme:d.associated_firs_auth_scheme||null,
                associatedProfileName:d.associated_mas_profile_name||null
            }});
        });
        return true;
    }

    if (cmd === "probeAuthIdentity") {
        BrowserStorage.get("user", function(saved) {
            var user = saved && saved.user ? saved.user : {};
            if (!AppstoreUtils.isValidUser(user) || !user.access_token || !user.device || !user.device.device_serial) {
                APKDebug.log("authIdentityProbe", "BLOCKED", {reason:"NoWorkingSession"});
                sendResponse({error:{type:"NoWorkingSession",message:"Log in with the working identity first."}});
                return;
            }
            var identity = data.identity || {};
            AppstoreAPI.probeRegisterIdentity(user.access_token, user.device.device_serial, identity, function(response){
                sendResponse({accepted:true});
            }, function(parsed){
                var msg="Amazon rejected the candidate identity.";
                var code="";
                try {
                    code=parsed.response.error.code || "";
                    msg=parsed.response.error.message || msg;
                } catch(e) {}
                sendResponse({accepted:false,error:null,timedOut:(code==="Timeout"),code:code,message:msg});
            });
        });
        return true;
    }


    if (cmd === "variantDiscoveryProbe") {
        var asin=(data.asin||"").trim().toUpperCase();
        var retailVersion=(data.appVersionNo||"").trim();
        if(!asin){sendResponse({error:{type:"MissingAsin",message:"No ASIN supplied."}});return true;}
        BrowserStorage.get(["user","appstore_device_descriptor_id"],function(saved){
            var user=saved&&saved.user?saved.user:{};
            if(!AppstoreUtils.isValidUser(user)){sendResponse({error:{type:"NotLoggedIn",message:"Log in first."}});return;}
            var d=user.device||{};
            var useAssociated=d.delivery_credential_mode==="associated" && !!d.associated_adp_token && !!d.associated_device_private_key;
            var token=useAssociated?d.associated_adp_token:d.main_adp_token;
            var key=useAssociated?d.associated_device_private_key:d.main_device_private_key;
            var descriptor=useAssociated?(d.associated_device_descriptor_id||""):(d.main_device_descriptor_id||saved.appstore_device_descriptor_id||"");
            var profileKey=d.mas_profile_key||Devices.DEFAULT_MAS_PROFILE;
            Devices.getProfile(profileKey,function(profile){
                APKDebug.log("variantDiscovery","START",{asin:asin,retailAppVersionNo:retailVersion||null,deliveryCredentialMode:useAssociated?"associated":"main",profileKey:profile.key,profileName:profile.name,descriptorPresent:!!descriptor});
                var report={asin:asin,retailAppVersionNo:retailVersion||null,capturedAt:new Date().toISOString(),deliveryCredentialMode:useAssociated?"associated":"main",profileKey:profile.key,profileName:profile.name,probes:[]};
                var personas=["active-profile","historical-acer"];
                function nextPersona(i){
                    if(i>=personas.length){
                        var url=AppstoreAPI.API_PRODUCT_METADATA_BASE+encodeURIComponent(asin);
                        AppstoreAPI.getSignedMetadataUrl(url,token,key,function(status,text,ct){
                            var ex=variantDiscoveryExtract(text||"");
                            report.probes.push({persona:"signed-adp",url:url,status:status,contentType:ct||"",responsePreview:String(text||"").substring(0,12000),parsed:ex.parsed,parseError:ex.parseError||null,candidates:ex.candidates,snippets:ex.snippets});
                            finish();
                        },function(type,message){report.probes.push({persona:"signed-adp",url:url,status:0,errorType:type||"Unknown",message:message||""});finish();},"variantDiscovery.signed-adp");
                        return;
                    }
                    runMasClientPersonaProbe(asin,profile,descriptor,personas[i],function(rec){report.probes.push(rec);nextPersona(i+1);});
                }
                function finish(){
                    try{chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[91300]},function(){});}catch(e){}
                    chrome.storage.local.set({apk_debug_last_variant_discovery:report},function(){
                        var total=0; report.probes.forEach(function(p){total+=(p.candidates||[]).length;});
                        APKDebug.log("variantDiscovery","COMPLETE",{asin:asin,probeCount:report.probes.length,totalCandidates:total,statuses:report.probes.map(function(p){return {persona:p.persona,status:p.status,parsed:!!p.parsed,candidates:(p.candidates||[]).length,errorType:p.errorType||null};})});
                        sendResponse({success:true,report:report});
                    });
                }
                nextPersona(0);
            });
        });
        return true;
    }

    if (cmd === "accountDeliveryTraceCapture") {
        var atrace=data || {};
        var areport={
            capturedAt:new Date().toISOString(),
            tracerInstalledAtDocumentStart:!!atrace.tracerInstalledAtDocumentStart,
            tracerTimeout:!!atrace.tracerTimeout,
            dom:atrace.dom||{},
            networkEvents:(Array.isArray(atrace.networkEvents)?atrace.networkEvents:[]).filter(function(ev){return !/unagi\.amazon\.com/i.test(String(ev&&ev.url||""));})
        };
        var interesting=[];
        var deviceRecords=[];
        var featureFlags={};
        var activityCounts={};
        var endpointCounts={};
        function addDevice(d){
            if(!d || typeof d!=="object") return;
            var rec={
                deviceName:d.deviceName||null,
                deviceTypeString:d.deviceTypeString||(d.metadata&&d.metadata.deviceTypeString)||null,
                deviceFamily:d.deviceFamily||(d.metadata&&d.metadata.deviceFamily)||null,
                deviceTypeID:d.deviceTypeID||null,
                deviceSerialNumber:d.deviceSerialNumber||null,
                deviceAccountID:d.deviceAccountID||null,
                deviceClassification:d.deviceClassification||null,
                formattedLastRegisteredDate:d.formattedLastRegisteredDate||null,
                isDefaultDevice:!!(d.isDefaultDevice||d.defaultDevice),
                isChildDevice:!!(d.isChildDevice||d.childDevice),
                actions:(d.metadata&&Array.isArray(d.metadata.actions))?d.metadata.actions:[]
            };
            if(!rec.deviceName && !rec.deviceAccountID && !rec.deviceSerialNumber) return;
            var key=[rec.deviceAccountID,rec.deviceSerialNumber,rec.deviceName].join("|");
            if(deviceRecords.some(function(x){return [x.deviceAccountID,x.deviceSerialNumber,x.deviceName].join("|")===key;})) return;
            deviceRecords.push(rec);
        }
        // v0.5.19: The legacy Appstore Your Devices page may already contain the
        // device list in the DOM and therefore emit no fresh GetDevicesOverview request.
        // Reconstruct device records from paired hidden accountId + deviceName controls.
        (function addLegacyDomDevices(){
            var vals=(areport.dom&&Array.isArray(areport.dom.extractedValues))?areport.dom.extractedValues:[];
            var pendingAccount=null;
            vals.forEach(function(v){
                var key=String(v&&v.key||"");
                var value=String(v&&v.value||"");
                if(/^accountId$/i.test(key) && value){ pendingAccount=value; return; }
                if(/^deviceName$/i.test(key) && value){
                    addDevice({deviceName:value,deviceAccountID:pendingAccount,deviceTypeString:/Android Device/i.test(value)?"Amazon Shopping App for Android":null,deviceFamily:/Android Device/i.test(value)?"MSHOP":null,deviceTypeID:/Android Device/i.test(value)?"A1MPSLFC7L5AFK":null,deviceClassification:/Android Device/i.test(value)?"APPLICATION":null});
                    pendingAccount=null;
                }
            });
            // Fallback for captures where only generic value attributes were collected.
            if(!deviceRecords.length){
                var generic=vals.filter(function(v){return String(v&&v.key||"").toLowerCase()==="value";});
                for(var i=0;i<generic.length-1;i++){
                    var a=String(generic[i].value||""), b=String(generic[i+1].value||"");
                    if(/^A[0-9A-Z]{10,}$/.test(a) && /Android Device/i.test(b)){
                        addDevice({deviceName:b,deviceAccountID:a,deviceTypeString:"Amazon Shopping App for Android",deviceFamily:"MSHOP",deviceTypeID:"A1MPSLFC7L5AFK",deviceClassification:"APPLICATION"}); i++;
                    }
                }
            }
        })();
        areport.networkEvents.forEach(function(ev){
            var url=String(ev.url||"");
            if(/unagi\.amazon\.com|\/1\/events\/com\.amazon\.csm|\/gp\/uedata|\/batch\/1\/OP/i.test(url)) return;
            var body=String(ev.requestBody||"");
            var preview=String(ev.responsePreview||"");
            var blob=[url,body,preview].join(" ");
            var am=body.match(/(?:^|[&?])activity=([^&]+)/);
            if(am){try{var an=decodeURIComponent(am[1]);activityCounts[an]=(activityCounts[an]||0)+1;}catch(e){}}
            endpointCounts[url]=(endpointCounts[url]||0)+1;
            if(/GetDevicesOverview/.test(body) && preview){
                try{
                    var parsed=JSON.parse(preview);
                    var dl=parsed&&parsed.GetDevicesOverview&&parsed.GetDevicesOverview.deviceList;
                    if(Array.isArray(dl)) dl.forEach(addDevice);
                }catch(e){}
            }
            if(/GetWebsiteConfig/.test(body) && preview){
                try{
                    var cfg=JSON.parse(preview).GetWebsiteConfig||{};
                    ["isAppManagementLaunched","isDeliverToDefaultDeviceEnabled","isPendingDeliveriesLaunched","isDeviceContentViewLaunched","isDefaultDeviceEnabled","useDefaultDeviceActivity","isHouseholdForAppsSupported"].forEach(function(k){if(Object.prototype.hasOwnProperty.call(cfg,k)) featureFlags[k]=cfg[k];});
                }catch(e){}
            }
            if(/deviceDeliveryString|deliveryString|deviceDescriptorId|deviceAccountId|deviceAccountID|accountDeviceId|deviceType|deviceSerial|amznDtid|registeredDevices|customerDevices|deregister|compatible|delivery|myapps|alldevices|GetDevicesOverview|GetWebsiteConfig/i.test(blob)) {
                interesting.push({kind:ev.kind||null,method:ev.method||null,url:url||null,status:ev.status,contentType:ev.contentType||null,durationMs:ev.durationMs||null,requestBody:body,responsePreview:preview});
            }
        });
        areport.deviceRecords=deviceRecords;
        areport.amazonFeatureFlags=featureFlags;
        areport.activityCounts=activityCounts;
        areport.endpointCounts=endpointCounts;
        areport.interestingEvents=interesting.slice(0,80);
        areport.deliveryAnalysis={
            syntheticAndroidDevices:deviceRecords.filter(function(d){return d.deviceTypeID==="A1MPSLFC7L5AFK" || /Amazon Shopping App for Android/i.test(d.deviceTypeString||"");}),
            uniqueDeviceAccountIDs:Array.from(new Set(deviceRecords.map(function(d){return d.deviceAccountID;}).filter(Boolean))),
            uniqueDeviceTypeIDs:Array.from(new Set(deviceRecords.map(function(d){return d.deviceTypeID;}).filter(Boolean))),
            candidateActivities:Object.keys(activityCounts).filter(function(k){return /device|deliver|content|app|pending/i.test(k);}),
            accountDeviceMap:deviceRecords.filter(function(d){return d.deviceAccountID||d.deviceName;}).map(function(d){return {deviceName:d.deviceName,deviceAccountID:d.deviceAccountID,deviceTypeID:d.deviceTypeID,deviceFamily:d.deviceFamily,deviceClassification:d.deviceClassification,formattedLastRegisteredDate:d.formattedLastRegisteredDate};}),
            sourceSummary:{networkDeviceRecords:areport.networkEvents.some(function(ev){return /GetDevicesOverview/.test(String(ev.requestBody||""));}),legacyDomAccountIds:(areport.dom.extractedValues||[]).filter(function(v){return /^accountId$/i.test(String(v.key||""));}).length,legacyDomDeviceNames:(areport.dom.extractedValues||[]).filter(function(v){return /^deviceName$/i.test(String(v.key||""));}).length},
            note:"v0.5.20 correlates deviceAccountID/deviceName from either GetDevicesOverview or the legacy Appstore DOM. Amazon CSM/Unagi telemetry is excluded from interestingEvents."
        };
        APKDebug.log("accountDeliveryTrace","CAPTURE",{
            pageKind:areport.dom.pageKind||null,
            extractedValueCount:(areport.dom.extractedValues||[]).length,
            scriptMatchCount:(areport.dom.scriptMatches||[]).length,
            namedDeviceCount:(areport.dom.namedDevices||[]).length,
            networkEventCount:areport.networkEvents.length,
            interestingEventCount:areport.interestingEvents.length,
            parsedDeviceCount:areport.deviceRecords.length,
            syntheticAndroidDeviceCount:areport.deliveryAnalysis.syntheticAndroidDevices.length,
            tracerInstalledAtDocumentStart:areport.tracerInstalledAtDocumentStart,
            tracerTimeout:areport.tracerTimeout
        });
        chrome.storage.local.set({apk_debug_last_account_delivery_trace:areport},function(){sendResponse({success:true,report:areport});});
        return true;
    }

    if (cmd === "clearAccountDeliveryTrace") {
        chrome.storage.local.remove("apk_debug_last_account_delivery_trace",function(){sendResponse({success:true});});
        return true;
    }

    if (cmd === "retailVariantTraceCapture") {
        var trace=data || {};
        var report={
            asin:trace.asin||null,
            capturedAt:new Date().toISOString(),
            tracerInstalledAtDocumentStart:!!trace.tracerInstalledAtDocumentStart,
            tracerTimeout:!!trace.tracerTimeout,
            networkEvents:Array.isArray(trace.networkEvents)?trace.networkEvents:[],
            dom:trace.dom||{}
        };
        var interesting=[];
        report.networkEvents.forEach(function(ev){
            var blob=[ev.url,ev.requestBody,ev.responsePreview].join(" ");
            if(/compatib|device|variant|version|contentid|content_id|artifact|delivery|offer|appVersionNo|asin/i.test(blob)) {
                interesting.push({kind:ev.kind||null,method:ev.method||null,url:ev.url||null,status:ev.status,contentType:ev.contentType||null,durationMs:ev.durationMs||null,requestBody:ev.requestBody||"",responsePreview:ev.responsePreview||""});
            }
        });
        report.interestingEvents=interesting.slice(0,80);
        APKDebug.log("retailVariantTrace","CAPTURE",{
            asin:report.asin,
            networkEventCount:report.networkEvents.length,
            interestingEventCount:report.interestingEvents.length,
            compatibilityElementCount:(report.dom.compatibilityElements||[]).length,
            scriptHintCount:(report.dom.scriptHints||[]).length,
            appVersionNo:report.dom.appVersionNo||null,
            tracerInstalledAtDocumentStart:report.tracerInstalledAtDocumentStart,
            tracerTimeout:report.tracerTimeout
        });
        chrome.storage.local.set({apk_debug_last_retail_variant_trace:report},function(){sendResponse({success:true,report:report});});
        return true;
    }

    if (cmd === "clearRetailVariantTrace") {
        chrome.storage.local.remove("apk_debug_last_retail_variant_trace",function(){sendResponse({success:true});});
        return true;
    }

    if (cmd === "compatibilityMetadataCapture") {
        var capture=data || {};
        var asin=capture.asin || "unknown";
        APKDebug.log("compatibilityMetadata", "CAPTURE", {
            asin:asin,
            title:capture.title || null,
            appVersionNo:capture.retail && capture.retail.appVersionNo || null,
            compatibilityText:capture.compatibilityText || "",
            technicalText:capture.technicalText || [],
            compatibilityElementCount:(capture.compatibilityElements || []).length,
            scriptHintCount:(capture.scriptHints || []).length
        });
        chrome.storage.local.get(["apk_debug_compatibility_captures"], function(saved){
            var all=saved.apk_debug_compatibility_captures || {};
            all[asin]=capture;
            chrome.storage.local.set({apk_debug_compatibility_captures:all},function(){sendResponse({success:true,asin:asin});});
        });
        return true;
    }

    if (cmd === "getCompatibilityCaptures") {
        chrome.storage.local.get(["apk_debug_compatibility_captures","apk_debug_download_results"],function(saved){
            sendResponse({success:true,captures:saved.apk_debug_compatibility_captures||{},downloadResults:saved.apk_debug_download_results||{}});
        });
        return true;
    }

    if (cmd === "clearCompatibilityCaptures") {
        chrome.storage.local.remove(["apk_debug_compatibility_captures","apk_debug_download_results"],function(){sendResponse({success:true});});
        return true;
    }

    if (cmd === "retailProbe") {
        APKDebug.log("retailPage", "PROBE", data || {});
        try {
            chrome.storage.local.set({apk_debug_last_retail_probe: data || {}});
        } catch (e) {}
        sendResponse({success:true});
        return;
    }

    if (cmd === "retailActionAttempt") {
        APKDebug.log("retailPage", "ACTION_ATTEMPT", data || {});
        sendResponse({success:true});
        return;
    }

    if (cmd === "retailOrderNativeTrigger") {
        APKDebug.log("retailOrder", "NATIVE_TRIGGER", data || {});
        sendResponse({success:true});
        return;
    }

    if (cmd === "retailOrderCompatibilityContinue") {
        APKDebug.log("retailOrder", "COMPATIBILITY_CONTINUE", data || {});
        sendResponse({success:true});
        return;
    }

    if (cmd === "retailOrderStart") {
        APKDebug.log("retailOrder", "START", data || {});
        try {
            chrome.storage.local.set({apk_debug_pending_order: data || {}});
            chrome.storage.local.remove("apk_debug_order_binding_retry_started");
        } catch (e) {}
        sendResponse({success:true});
        return;
    }

    if (cmd === "retailOrderResult") {
        APKDebug.log("retailOrder", "RESULT", data || {});
        try {
            chrome.storage.local.set({apk_debug_last_order_result: data || {}});
            if (data && data.terminal) chrome.storage.local.remove("apk_debug_pending_order");
            if (data && data.success && String((data.pendingOrder&&data.pendingOrder.asin)||data.asin||"").toUpperCase()==="B017250D16") {
                chrome.storage.local.get("apk_debug_order_binding_retry_started",function(saved){
                    if(saved&&saved.apk_debug_order_binding_retry_started)return;
                    chrome.storage.local.set({apk_debug_order_binding_retry_started:{asin:"B017250D16",time:new Date().toISOString()}},function(){runPostOrderBindingRetry(data,function(){});});
                });
            }
        } catch (e) {}
        sendResponse({success:true});
        return;
    }

    if (cmd === "getPendingOrder") {
        try {
            chrome.storage.local.get(["apk_debug_pending_order"], function(v){
                sendResponse({success:true, pending:v && v.apk_debug_pending_order ? v.apk_debug_pending_order : null});
            });
        } catch (e) { sendResponse({success:false,pending:null}); }
        return true;
    }

    if (cmd === "accountProbe") {
        APKDebug.log("accountDevice", "PROBE", data || {});
        try {
            chrome.storage.local.set({apk_debug_last_account_probe: data || {}});
        } catch (e) {}
        sendResponse({success:true});
        return;
    }

    if (cmd === "signRequest") {
        if (message.target === "apk-offscreen-signer") return;
        if (typeof requestSignatureViaOffscreen !== "function") {
            sendResponse(AppstoreUtils.signRequest(data, message.useLegacyAuth));
            return;
        }
        requestSignatureViaOffscreen(data, message.useLegacyAuth).then(function(signature) {
            APKDebug.log("mv3.signer", "OFFSCREEN_SUCCESS", {legacyAuth:!!message.useLegacyAuth, signaturePresent:!!signature});
            sendResponse(signature);
        }).catch(function(err) {
            APKDebug.log("mv3.signer", "OFFSCREEN_ERROR", {message:String(err)});
            sendResponse(null);
        });
        return true;
    } else if (cmd === "oauth2Callback") {
        chrome.tabs.remove(sender.tab.id, function() {
            chrome.tabs.create({url: chrome.runtime.getURL("oauth2-callback.html") + "#" + data.query});
        });
    } else if (cmd === "openPage") {
        chrome.tabs.create({url: chrome.runtime.getURL(message.page + ".html")});
    } else if (cmd === "trackEvent") {
        ZAnalytics.trackEvent(data);
    }
});

chrome.runtime.onInstalled.addListener(function(details) {
    APKDebug.log("extension", "INSTALLED", {reason: details.reason, version: chrome.runtime.getManifest().version});
    ZAnalytics.trackEvent(["install", details.reason, chrome.runtime.getManifest().version]);
    // v0.5.34 migration: make the proven KFRAWI tablet profile the active MAS profile.
    try {
        var o={}; o[Devices.MAS_PROFILE_STORAGE_KEY]=Devices.DEFAULT_MAS_PROFILE;
        BrowserStorage.set(o);
        APKDebug.log("extension", "DEFAULT_PROFILE_MIGRATED", {profileKey:Devices.DEFAULT_MAS_PROFILE});
    } catch(e) { APKDebug.log("extension", "DEFAULT_PROFILE_MIGRATION_FAILED", {message:String(e)}); }
});

chrome.action.onClicked.addListener(function() {
    chrome.runtime.openOptionsPage();
});
