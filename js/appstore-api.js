"use strict";

var AppstoreAPI = {
    API_OAUTH2_SIGNIN: "https://www.amazon.com/ap/signin",
    API_AUTH_REGISTER: "https://api.amazon.com/auth/register",
    API_REGISTER_DEVICE: "https://firs-ta-g7g.amazon.com/FirsProxy/registerDevice",
    API_REGISTER_ASSOCIATED_DEVICE: "https://firs-ta-g7g.amazon.com/FirsProxy/registerAssociatedDevice",
    API_GET_DOWNLOAD_URL: "https://mas-ext.amazon.com/getDownloadUrl",
    API_PRODUCT_METADATA_BASE: "https://mas-ssr.amazon.com/gp/masclient/dp/",
    API_APPSTORE_ONLY_REGISTER_DEVICE: "https://mas-ext.amazon.com/appstoreOnlyRegisterDevice",

    register: function(user, success, error) {
        AppstoreUtils.getAuthIdentity(function(identity) {
            var request = {
                requested_extensions: ["device_info", "customer_info"],
                auth_data: {
                    access_token: user.access_token,
                    use_global_authentication: "true"
                },
                registration_data: {
                    device_model: identity.deviceModel || "defaultDeviceName",
                    device_serial: user.device.device_serial,
                    software_version: "130050001",
                    device_type: identity.deviceType || AppstoreUtils.DEVICE_TYPE_MAIN,
                    domain: "Device",
                    app_version: "647000110",
                    app_name: AppstoreUtils.APP_NAME,
                    os_version: identity.osVersion || "defaultOsVersion"
                },
                requested_token_type: ["bearer", "mac_dms"]
            };

            APKDebug.log("auth/register", "REQUEST", {
                url: AppstoreAPI.API_AUTH_REGISTER,
                identityPreset: identity.preset || "custom",
                registration_data: request.registration_data,
                requested_extensions: request.requested_extensions,
                requested_token_type: request.requested_token_type
            });

            var xhr = new XMLHttpRequest();
            xhr.onload = function() {
                if (xhr.status !== 200) {
                    APKDebug.log("auth/register", "ERROR", {
                        status: xhr.status,
                        responseText: xhr.responseText,
                        identityPreset: identity.preset || "custom"
                    });
                    if (error) error.call(xhr);
                    return;
                }
                var result = JSON.parse(xhr.responseText);
                var response = result.response || null;
                APKDebug.log("auth/register", "SUCCESS", {
                    status: xhr.status,
                    identityPreset: identity.preset || "custom",
                    authDeviceType: request.registration_data.device_type,
                    authDeviceModel: request.registration_data.device_model,
                    authOsVersion: request.registration_data.os_version,
                    customerName: response && response.success && response.success.extensions && response.success.extensions.customer_info ? response.success.extensions.customer_info.name : null,
                    deviceName: response && response.success && response.success.extensions && response.success.extensions.device_info ? response.success.extensions.device_info.device_name : null,
                    tokenTypesReturned: response && response.success && response.success.tokens ? Object.keys(response.success.tokens) : []
                });
                if (success) success(user, response);
            };
            xhr.open("POST", AppstoreAPI.API_AUTH_REGISTER, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify(request));
        });
    },

    probeRegisterIdentity: function(accessToken, deviceSerial, identity, success, error) {
        identity = identity || {};
        var request = {
            requested_extensions: ["device_info", "customer_info"],
            auth_data: {access_token: accessToken, use_global_authentication: "true"},
            registration_data: {
                device_model: identity.deviceModel || "defaultDeviceName",
                device_serial: deviceSerial,
                software_version: "130050001",
                device_type: identity.deviceType || AppstoreUtils.DEVICE_TYPE_MAIN,
                domain: "Device",
                app_version: "647000110",
                app_name: AppstoreUtils.APP_NAME,
                os_version: identity.osVersion || "defaultOsVersion"
            },
            requested_token_type: ["bearer", "mac_dms"]
        };
        APKDebug.log("authIdentityProbe", "REQUEST", {
            identityPreset: identity.preset || "custom",
            registration_data: request.registration_data,
            note: "Uses the currently stored OAuth access token but does not replace stored working MAS credentials."
        });

        /* MV3 service workers do not expose XMLHttpRequest. v0.5.30 logged REQUEST
           and then threw before the HTTP request was dispatched. Use fetch here so
           the direct tablet identity probe can actually run in the service worker. */
        var controller = new AbortController();
        var timer = setTimeout(function(){ controller.abort(); }, 15000);
        fetch(AppstoreAPI.API_AUTH_REGISTER, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify(request),
            signal: controller.signal
        }).then(function(resp){
            return resp.text().then(function(text){ return {resp:resp,text:text}; });
        }).then(function(result){
            clearTimeout(timer);
            var resp=result.resp, text=result.text, parsed=null;
            try { parsed=JSON.parse(text || "{}"); } catch(e) {}
            if(!resp.ok){
                APKDebug.log("authIdentityProbe", "REJECTED", {
                    status: resp.status,
                    identityPreset: identity.preset || "custom",
                    deviceType: request.registration_data.device_type,
                    deviceModel: request.registration_data.device_model,
                    osVersion: request.registration_data.os_version,
                    responseText: text
                });
                if(error) error(parsed || {response:{error:{code:"HTTP"+resp.status,message:text||("HTTP "+resp.status)}}});
                return;
            }
            var response=parsed && parsed.response ? parsed.response : null;
            APKDebug.log("authIdentityProbe", "ACCEPTED", {
                status: resp.status,
                identityPreset: identity.preset || "custom",
                deviceType: request.registration_data.device_type,
                deviceModel: request.registration_data.device_model,
                osVersion: request.registration_data.os_version,
                deviceName: response && response.success && response.success.extensions && response.success.extensions.device_info ? response.success.extensions.device_info.device_name : null,
                tokenTypesReturned: response && response.success && response.success.tokens ? Object.keys(response.success.tokens) : []
            });
            if(success) success(response);
        }).catch(function(err){
            clearTimeout(timer);
            var isAbort=err && err.name === "AbortError";
            APKDebug.log("authIdentityProbe", isAbort ? "TIMEOUT" : "NETWORK_ERROR", {
                timeoutMs: isAbort ? 15000 : undefined,
                identityPreset: identity.preset || "custom",
                deviceType: request.registration_data.device_type,
                deviceModel: request.registration_data.device_model,
                osVersion: request.registration_data.os_version,
                errorName: err && err.name ? err.name : "Unknown",
                errorMessage: err && err.message ? err.message : String(err || "")
            });
            if(error) error({response:{error:{code:isAbort?"Timeout":"NetworkError",message:isAbort?"Identity probe timed out after 15 seconds.":((err&&err.message)||"Identity probe network error.")}}});
        });
    },

    registerDevice: function(accessToken, device, callback) {
        var body = '<?xml version="1.0" encoding="UTF-8" ?>' +
            '<request><parameters>' +
            '<deviceType>' + AppstoreUtils.DEVICE_TYPE_MAIN + '</deviceType>' +
            '<deviceSerialNumber>' + device.device_serial + '</deviceSerialNumber>' +
            '<pid>' + AppstoreUtils.getPid(device.device_serial) + '</pid>' +
            '<authToken>' + accessToken + '</authToken>' +
            '<authTokenType>AccessToken</authTokenType>' +
            '<softwareVersion>' + AppstoreUtils.APP_VERSION + '</softwareVersion>' +
            '</parameters></request>';

        APKDebug.log("registerDevice", "REQUEST", {url: AppstoreAPI.API_REGISTER_DEVICE, body: body});

        var xhr = new XMLHttpRequest();
        xhr.onload = function() {
            if (xhr.status !== 200 || !xhr.responseXML) {
                APKDebug.log("registerDevice", "ERROR", {status: xhr.status, responseText: xhr.responseText});
                return;
            }
            function txt(name) {
                var node = xhr.responseXML.querySelector(name);
                return node ? node.textContent : "";
            }
            APKDebug.log("registerDevice", "SUCCESS", {
                status: xhr.status,
                device_name: txt("user_device_name"),
                adp_token: txt("adp_token"),
                device_private_key: txt("device_private_key")
            });
            if (callback) callback({
                device_name: txt("user_device_name"),
                adp_token: txt("adp_token"),
                device_private_key: txt("device_private_key")
            });
        };
        xhr.open("POST", AppstoreAPI.API_REGISTER_DEVICE, true);
        xhr.setRequestHeader("Content-Type", "text/xml");
        xhr.send(body);
    },

    registerAssociatedDevice: function(user, success, error, options) {
        options = options || {};
        var legacyAuth = !!options.legacyAuth;
        var debugStage = options.debugStage || "registerAssociatedDevice";
        var associatedDeviceType = options.associatedDeviceType || AppstoreUtils.DEVICE_TYPE_ASSOCIATED;
        try {
            var device = user && user.device ? user.device : {};
            APKDebug.log(debugStage, "BUILD_REQUEST_START", {
                associatedDeviceType: associatedDeviceType,
                authScheme: legacyAuth ? "legacy-adp" : "standard-adp",
                deviceSerialPresent: !!device.device_serial,
                mainAdpTokenPresent: !!device.main_adp_token,
                mainPrivateKeyPresent: !!device.main_device_private_key
            });
            var pid = AppstoreUtils.getPid(device.device_serial || "");
            var body = '<?xml version="1.0" encoding="UTF-8"?>' +
                '<request><parameters>' +
                '<deviceType>' + associatedDeviceType + '</deviceType>' +
                '<deviceSerialNumber>' + device.device_serial + '</deviceSerialNumber>' +
                '<pid>' + pid + '</pid>' +
                '<deregisterExisting>true</deregisterExisting>' +
                '<softwareVersion>' + AppstoreUtils.APP_VERSION + '</softwareVersion>' +
                '<softwareComponentId>' + AppstoreUtils.APP_NAME + '</softwareComponentId>' +
                '</parameters></request>';

            APKDebug.log(debugStage, "REQUEST", {
                url: AppstoreAPI.API_REGISTER_ASSOCIATED_DEVICE,
                body: body,
                mainDeviceType: AppstoreUtils.DEVICE_TYPE_MAIN,
                associatedDeviceType: associatedDeviceType,
                authScheme: legacyAuth ? "legacy-adp" : "standard-adp",
                pidPresent: !!pid
            });

            new AppstoreWebService()
                .withUrl(AppstoreAPI.API_REGISTER_ASSOCIATED_DEVICE)
                .withMethod("POST")
                .withContentType("text/xml")
                .withAdpToken(device.main_adp_token)
                .withPrivateKey(device.main_device_private_key)
                .withBody(body)
                .useLegacyAuth(legacyAuth)
                .withDebugStage(debugStage)
                .onSuccess(function() {
                    var text = this.responseText || "";
                    var adp = "", key = "";
                    try {
                        function txt(name) {
                            if (this.responseXML && this.responseXML.querySelector) {
                                var node=this.responseXML.querySelector(name);
                                return node ? node.textContent : "";
                            }
                            var re=new RegExp("<"+name+">([\\s\\S]*?)</"+name+">", "i");
                            var m=String(text).match(re);
                            return m ? m[1] : "";
                        }
                        adp = txt.call(this,"adp_token");
                        key = txt.call(this,"device_private_key");
                    } catch (parseErr) {
                        APKDebug.log(debugStage, "PARSE_ERROR", {message:String(parseErr)});
                    }
                    APKDebug.log(debugStage, "PARSED_SUCCESS", {
                        adp_token: adp,
                        device_private_key: key
                    });
                    if (!adp || !key) {
                        if (error) error("IncompleteAssociatedCredentials", "FIRS returned HTTP 200 but no associated ADP credential pair was parsed.");
                        return;
                    }
                    if (success) success(user, {adp_token:adp, device_private_key:key});
                })
                .onError(error)
                .call();
        } catch (err) {
            APKDebug.log(debugStage, "SYNC_ERROR", {message:String(err && err.message ? err.message : err)});
            if (error) error("SynchronousError", String(err && err.message ? err.message : err));
        }
    },


    getProductMetadata: function(asin, adpToken, privateKey, success, error) {
        var url = AppstoreAPI.API_PRODUCT_METADATA_BASE + encodeURIComponent(asin);

        function preview(text) {
            if (text === undefined || text === null) return "";
            return String(text).substring(0, 24000);
        }
        function walk(node, path, versions, actions, details) {
            if (!node || typeof node !== "object") return;
            if (!Array.isArray(node)) {
                Object.keys(node).forEach(function(k) {
                    var v=node[k], lk=k.toLowerCase();
                    if (/version|versioncode|appversion|versionno/.test(lk) && (typeof v === "string" || typeof v === "number")) versions.push({path:path+"."+k,value:String(v)});
                    if (/displaytitle|title|packagename|package_name|bundle/.test(lk) && (typeof v === "string" || typeof v === "number")) details.push({path:path+"."+k,value:String(v)});
                    if (/buy|purchase|acquire|order|entitle|offer|action|url/.test(lk) && typeof v === "string") actions.push({path:path+"."+k,value:v});
                });
            }
            if (Array.isArray(node)) node.forEach(function(v,i){ walk(v,path+"["+i+"]",versions,actions,details); });
            else Object.keys(node).forEach(function(k){ if (node[k] && typeof node[k] === "object") walk(node[k],path+"."+k,versions,actions,details); });
        }

        BrowserStorage.get('appstore_device_descriptor_id', function(saved) {
            var descriptor=(saved && saved.appstore_device_descriptor_id) || "";
            APKDebug.log("productMetadata.masclient","REQUEST",{
                url:url, method:"GET", deviceDescriptorId:descriptor ? "[PRESENT]" : "[MISSING]",
                emulatedModel:AppstoreUtils.DEVICE_MODEL, apiLevel:AppstoreUtils.OS_VERSION,
                note:"Manifest V3 declarativeNetRequest injects Appstore User-Agent and masclient-device-info Cookie"
            });

            fetch(url, {
                method:"GET",
                headers:{"Accept":"application/json","Accept-Language":"en-US","X-Requested-With":AppstoreUtils.APP_NAME},
                credentials:"omit"
            }).then(function(resp){
                return resp.text().then(function(text){
                    var ct=resp.headers.get('content-type')||'';
                    var result={asin:asin,status:resp.status,contentType:ct,responsePreview:preview(text),version:null,versionCandidates:[],actionCandidates:[],detailCandidates:[],selectedSource:'masclient-mv3-dnr'};
                    try {
                        var parsed=JSON.parse(text), versions=[], actions=[], details=[];
                        walk(parsed,'$',versions,actions,details);
                        result.versionCandidates=versions.slice(0,100);
                        result.actionCandidates=actions.slice(0,100);
                        result.detailCandidates=details.slice(0,100);
                        for(var i=0;i<versions.length;i++){ var vv=versions[i].value; if(vv && vv!=="0"){ result.version=vv; break; } }
                        result.parsed=true;
                    } catch(e) { result.parseError=String(e); }
                    APKDebug.setLastMetadata(result);
                    APKDebug.log("productMetadata.masclient",resp.status===200?"RESPONSE":"HTTP_ERROR",result);
                    if(resp.status===200 && success) success({version:result.version,source:'masclient-mv3-dnr',raw:result});
                    else if(error) error('MetadataHttp'+resp.status,'Metadata request returned HTTP '+resp.status);
                });
            }).catch(function(err){
                var r={asin:asin,status:0,networkError:true,message:String(err),selectedSource:'masclient-mv3-dnr'};
                APKDebug.setLastMetadata(r); APKDebug.log("productMetadata.masclient","NETWORK_ERROR",r);
                if(error) error('MetadataNetworkError','Metadata network error');
            });
        });
    },

    getSignedMetadataUrl: function(url, token, key, success, error, debugStage) {
        debugStage = debugStage || "variantDiscovery.signed";
        APKDebug.log(debugStage, "REQUEST", {url:url, method:"GET", authScheme:"legacy-adp"});
        new AppstoreWebService()
            .withUrl(url)
            .withMethod("GET")
            .withContentType("application/json")
            .withAdpToken(token)
            .withPrivateKey(key)
            .withBody("")
            .useLegacyAuth(true)
            .withDebugStage(debugStage)
            .onSuccess(function() {
                if (success) success(this.status, this.responseText, this.getResponseHeader ? (this.getResponseHeader("content-type") || "") : "");
            })
            .onError(error)
            .call();
    },

    getDownloadUrl: function(body, token, key, success, error, profileInfo, experiment) {
        experiment = experiment || {};
        var debugStage = experiment.debugStage || "getDownloadUrl";
        var extraHeaders = experiment.extraHeaders || {};
        var headerSummary = {};
        Object.keys(extraHeaders).forEach(function(k) { headerSummary[k] = "[PRESENT]"; });
        APKDebug.log(debugStage, "REQUEST", {
            url: AppstoreAPI.API_GET_DOWNLOAD_URL,
            body: body,
            credentialMode: experiment.credentialModeLabel || "auth/register-mac_dms-direct",
            authScheme: "legacy-adp",
            firsAssociatedStage: experiment.firsAssociatedStage || "not-used",
            sessionBindingExperiment: experiment.name || "baseline",
            credentialsMode: experiment.credentialsMode || "omit",
            extraHeaders: headerSummary,
            descriptorPresent: !!experiment.descriptorPresent,
            xCookiePresent: !!experiment.xCookiePresent,
            emulatedProfile: {
                profileKey: profileInfo && profileInfo.key || null,
                profileName: profileInfo && profileInfo.name || null,
                model: profileInfo && profileInfo.model || AppstoreUtils.DEVICE_MODEL,
                authDeviceType: AppstoreUtils.DEVICE_TYPE_MAIN,
                historicalAssociatedDeviceType: AppstoreUtils.DEVICE_TYPE_ASSOCIATED,
                appstoreProfileDeviceType: profileInfo && profileInfo.deviceType || "A2QCPPMSOLGVZE"
            }
        });

        new AppstoreWebService()
            .withUrl(AppstoreAPI.API_GET_DOWNLOAD_URL)
            .withMethod("POST")
            .withContentType("text/plain; charset=UTF-8")
            .withAdpToken(token)
            .withPrivateKey(key)
            .withBody(body)
            .useLegacyAuth(true)
            .withExtraHeaders(extraHeaders)
            .withCredentials(experiment.credentialsMode || "omit")
            .withDebugStage(debugStage)
            .onSuccess(function() {
                var result = JSON.parse(this.responseText);
                APKDebug.log(debugStage, "PARSED_SUCCESS", result);
                if (success) success(result);
            })
            .onError(error)
            .call();
    },

    appstoreOnlyRegisterDevice: function(body, token, key, success, error, legacyAuth, debugStage) {
        var parsed;
        if (legacyAuth === undefined || legacyAuth === null) legacyAuth = true;
        debugStage = debugStage || "appstoreOnlyRegisterDevice";
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        APKDebug.log(debugStage, "REQUEST", {
            url: AppstoreAPI.API_APPSTORE_ONLY_REGISTER_DEVICE,
            body: parsed,
            authScheme: legacyAuth ? "legacy-adp" : "standard-adp"
        });

        new AppstoreWebService()
            .withUrl(AppstoreAPI.API_APPSTORE_ONLY_REGISTER_DEVICE)
            .withMethod("POST")
            .withContentType("application/x-www-form-urlencoded")
            .withAdpToken(token)
            .withPrivateKey(key)
            .withBody(body)
            .useLegacyAuth(legacyAuth)
            .withDebugStage(debugStage)
            .onSuccess(function() {
                APKDebug.log(debugStage, "SUCCESS", {
                    status: this.status,
                    responseText: this.responseText,
                    authScheme: legacyAuth ? "legacy-adp" : "standard-adp"
                });
                try {
                    var registrationResult = JSON.parse(this.responseText);
                    if (registrationResult && registrationResult.deviceDescriptorId) {
                        BrowserStorage.set({appstore_device_descriptor_id: registrationResult.deviceDescriptorId});
                        APKDebug.log(debugStage, "DESCRIPTOR_STORED", {deviceDescriptorId:"[REDACTED]"});
                    }
                    if (registrationResult && Array.isArray(registrationResult.identityTokens)) {
                        registrationResult.identityTokens.forEach(function(t) {
                            if (t && t.name === "x-cookie" && t.value) {
                                BrowserStorage.set({appstore_identity_x_cookie: t.value});
                                APKDebug.log(debugStage, "X_COOKIE_STORED", {name:"x-cookie", value:"[REDACTED]"});
                            }
                        });
                    }
                } catch (descriptorError) {
                    APKDebug.log(debugStage, "DESCRIPTOR_PARSE_ERROR", {message:String(descriptorError)});
                }
                if (success) success(this);
            })
            .onError(error)
            .call();
    }
};
