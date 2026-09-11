"use strict";

/* v0.5.4 MAS capability profile selector. Auth identity remains separate. */
var Devices = {
    MAS_PROFILE_STORAGE_KEY: "apk_mas_profile",
    DEFAULT_MAS_PROFILE: "firehd8-2022-kfrawi",
    PROFILES: {"firemax11":{"name":"Fire Max 11 (2023) - conservative","specs":{"deviceType":"A2QCPPMSOLGVZE","deviceInfo":{"networkType":"WIFI","carrier":"unknown","ref":"unknown","lastKnownLocation":"unknown","deviceType":"A2QCPPMSOLGVZE","manufacturer":"Amazon","brand":"Amazon","model":"KFSNWI","build.device":"sunstone","build.product":"sunstone","build.hardware":"sunstone","build.board":"sunstone","build.id":"RS8338.3339N","display":"RS8338.3339N","build.serial":"unknown","build.fingerprint":"Amazon/sunstone/sunstone:11/RS8338.3339N/0030132734852:user/amz-p,release-keys","APILevel":"30","releaseVersion":"11","cpuABI":"arm64-v8a","build.cpuABI2":"armeabi-v7a","screenRotation":"0","screenRealSize.width":"2000","screenRealSize.height":"1200","screenSize.width":"2000","screenSize.height":"1200","deviceDisplayPixelsWidth":"2000","deviceDisplayPixelsHeight":"1200","deviceDisplayXDpi":"213","deviceDisplayYDpi":"213","deviceDensityClassification":"240","deviceDensityLogical":"1.5","deviceDensityScaled":"1.5","deviceScreenLayout":"SCREENLAYOUT_SIZE_XLARGE","deviceTouchscreen":"TOUCHSCREEN_FINGER","deviceNavigation":"NAVIGATION_NONAV","deviceKeyboard":"KEYBOARD_NOKEYS","screenLayoutDirMask":"192","screenLongMask":"48","screenSizeMask":"15","screenLayoutRaw":"268435555","sizeRangeSmallest":"1200 , 1125","sizeRangeLargest":"2000 , 1925","openGlEsVersion":"0x00030002","openGlEsExtensions":"GL_OES_EGL_image GL_OES_EGL_image_external GL_OES_element_index_uint GL_OES_texture_npot GL_OES_vertex_array_object GL_EXT_texture_format_BGRA8888 GL_KHR_debug","android.hardware.screen.portrait":"true","android.hardware.screen.landscape":"true","android.hardware.touchscreen":"true","android.hardware.touchscreen.multitouch":"true","android.hardware.touchscreen.multitouch.distinct":"true","android.hardware.touchscreen.multitouch.jazzhand":"true","android.hardware.faketouch":"true","android.hardware.wifi":"true","android.hardware.wifi.direct":"true","android.hardware.bluetooth":"true","android.hardware.bluetooth_le":"true","android.hardware.location":"true","android.hardware.location.network":"true","android.hardware.location.gps":"false","android.hardware.camera":"true","android.hardware.camera.any":"true","android.hardware.camera.front":"true","android.hardware.camera.autofocus":"true","android.hardware.camera.flash":"false","android.hardware.microphone":"true","android.hardware.sensor.accelerometer":"true","android.hardware.sensor.light":"true","android.hardware.sensor.compass":"false","android.hardware.sensor.gyroscope":"false","android.hardware.sensor.proximity":"false","android.hardware.sensor.barometer":"false","android.hardware.nfc":"false","android.hardware.nfc.hce":"false","android.hardware.telephony":"false","android.hardware.telephony.gsm":"false","android.hardware.consumerir":"false","android.hardware.usb.host":"true","android.hardware.usb.accessory":"true","android.software.input_methods":"true","android.software.app_widgets":"true","android.software.home_screen":"true","android.software.live_wallpaper":"true","android.software.device_admin":"true","android.software.sip":"false","android.software.sip.voip":"false","isRooted":"false","isEmulator":"false","isPreloaded":"true","isPreloadedUpdate":"false","capabilitiesCodeVersion":"2.0","secure_android_id":"generated"}},"description":"Current conservative Fire Max 11 profile used by the working downloader."},"aftmm-reported":{"name":"Fire TV Stick 4K AFTMM / mantis - reported partial-success profile","specs":{"deviceType":"NS6268","deviceInfo":{"networkType":"WIFI","com.sec.feature.multiwindow.multiwindowlaunch":"true","build.hardware":"mantis","build.cpuABI2":"armeabi","screenLayoutDirMask":"192","android.hardware.screen.portrait":"false","screenRealSize.height":"1920","android.hardware.camera.any":"true","isPreloadedUpdate":"false","android.hardware.bluetooth":"true","android.hardware.touchscreen.multitouch.distinct":"true","build.fingerprint":"Amazon/mantis/mantis:8.0/NS6268/2315N:user/amz-p,release-keys","android.hardware.microphone":"true","carrier":"Android","com.sec.feature.healthcover":"true","screenRotation":"0","deviceDisplayXDpi":"422.03","android.hardware.camera":"true","screenLayoutRaw":"268435554","com.sec.feature.minimode":"true","android.hardware.sensor.stepcounter":"true","android.software.sip.voip":"true","isRooted":"true","secure.android_id":"b04863f7fd02ff2","build.device":"mantis","com.sec.android.mdm":"true","com.sec.feature.sensorhub":"true","openGlEsExtensions":"GL_ARM_mali_program_binary GL_ARM_mali_shader_binary GL_ARM_rgba8 GL_EXT_blend_minmax GL_EXT_debug_marker GL_EXT_discard_framebuffer GL_EXT_multisampled_render_to_texture GL_EXT_occlusion_query_boolean GL_EXT_read_format_bgra GL_EXT_shadow_samplers GL_EXT_texture_format_BGRA8888 GL_EXT_texture_rg GL_EXT_texture_storage GL_EXT_texture_type_2_10_10_10_REV GL_KHR_debug GL_KHR_texture_compression_astc_hdr GL_KHR_texture_compression_astc_ldr GL_OES_EGL_image GL_OES_EGL_image_external GL_OES_EGL_sync GL_OES_blend_equation_separate GL_OES_blend_func_separate GL_OES_blend_subtract GL_OES_byte_coordinates GL_OES_compressed_ETC1_RGB8_texture GL_OES_compressed_paletted_texture GL_OES_depth24 GL_OES_depth_texture GL_OES_depth_texture_cube_map GL_OES_draw_texture GL_OES_element_index_uint GL_OES_extended_matrix_palette GL_OES_fbo_render_mipmap GL_OES_fixed_point GL_OES_framebuffer_object GL_OES_get_program_binary GL_OES_mapbuffer GL_OES_matrix_get GL_OES_matrix_palette GL_OES_packed_depth_stencil GL_OES_point_size_array GL_OES_point_sprite GL_OES_query_matrix GL_OES_read_format GL_OES_required_internalformat GL_OES_rgb8_rgba8 GL_OES_single_precision GL_OES_standard_derivatives GL_OES_stencil8 GL_OES_stencil_wrap GL_OES_surfaceless_context GL_OES_texture_3D GL_OES_texture_compression_astc GL_OES_texture_cube_map GL_OES_texture_mirrored_repeat GL_OES_texture_npot GL_OES_vertex_array_object GL_OES_vertex_half_float","deviceType":"A3GFS040JDOGQR","android.hardware.sensor.light":"true","com.sec.feature.secretmode_service":"true","com.sec.feature.cover.sview":"true","build.serial":"4d00a2bb4c1121f7","deviceDisplayYDpi":"424.069","android.hardware.camera.flash":"true","sharedLibraries":"SLinkNTSManager allshare android.test.runner com.android.future.usb.accessory com.android.location.provider com.android.media.remotedisplay com.android.nfc_extras com.broadcom.bt com.broadcom.nfc com.dsi.ant.antradio_library com.google.android.gms com.google.android.maps com.google.android.media.effects com.google.widevine.software.drm com.gsma.services.nfc com.samsung.device com.sec.android.app.minimode com.sec.android.app.multiwindow com.sec.android.mdm com.sec.android.visualeffect com.sec.smartcard.auth com.validity.fingerprint javax.obex libvtmanagerjar mmappframeworklib org.simalliance.openmobileapi samsung_library_music sec_feature sec_platform_library seccamera sechardware secimaging secmarcoa secmediarecorder secvision sgi smartfaceservice smatlib svi sws touchwiz videowall","deviceTouchscreen":"TOUCHSCREEN_FINGER","com.sec.feature.cover.flip":"true","android.hardware.sensor.compass":"true","ref":"unknown","com.sec.feature.sidetouch":"true","lastKnownLocation":"unknown","com.sec.feature.multiwindow.phone":"true","brand":"Amazon","isPreloaded":"false","android.hardware.location.gps":"true","com.sec.feature.multiwindow":"true","android.hardware.telephony.gsm":"true","android.hardware.nfc.hce":"true","android.hardware.touchscreen":"true","android.hardware.sensor.accelerometer":"true","deviceDisplayPixelsHeight":"1920","com.sec.feature.findo":"true","sizeRangeSmallest":"1920 , 1005","android.hardware.location":"true","screenRealSize.width":"1920","android.hardware.screen.landscape":"true","deviceDensityClassification":"480","deviceDensityScaled":"3.0","capabilitiesCodeVersion":"1.1.89.16","com.sec.feature.multiwindow.multiinstance":"true","com.sec.feature.hovering_ui":"true","android.hardware.camera.autofocus":"true","android.software.live_wallpaper":"true","com.sec.feature.cover.sviewcover":"true","openGlEsVersion":"0x00030000","deviceScreenLayout":"SCREENLAYOUT_SIZE_NORMAL","build.board":"universal5422","screenSize.height":"1920","display":"KOT49H.G900HXXU1ANG3","APILevel":"24","screenSizeMask":"15","android.hardware.faketouch":"true","deviceDensityLogical":"3.0","screenLongMask":"48","manufacturer":"Amazon","android.hardware.sensor.proximity":"true","sizeRangeLargest":"1920 , 1845","android.software.device_admin":"true","com.nxp.mifare":"true","cpuABI":"armeabi-v7a","screenSize.width":"1920","android.hardware.wifi":"true","android.hardware.location.network":"true","model":"AFTMM","android.hardware.nfc":"true","android.hardware.bluetooth_le":"true","com.sec.feature.fingerprint_manager_service":"true","android.software.input_methods":"true","android.hardware.sensor.gyroscope":"true","build.id":"AFTMM","android.hardware.wifi.direct":"true","android.hardware.usb.accessory":"true","com.sec.feature.multiwindow.commonui":"true","deviceNavigation":"NAVIGATION_NONAV","releaseVersion":"8.0","deviceDisplayPixelsWidth":"1920","android.software.app_widgets":"true","com.sec.feature.samsunglinkplatform":"true","com.sec.feature.barcode_emulator":"true","android.hardware.telephony":"false","android.software.sip":"false","android.hardware.touchscreen.multitouch.jazzhand":"true","android.hardware.sensor.barometer":"true","android.hardware.usb.host":"true","android.hardware.touchscreen.multitouch":"true","deviceKeyboard":"KEYBOARD_NOKEYS","android.software.home_screen":"true","android.hardware.consumerir":"true","isEmulator":"false","android.hardware.sensor.stepdetector":"true","android.hardware.camera.front":"true","build.product":"mantis"}},"description":"Historical user-reported profile preserved as supplied. It contains AFTMM/mantis plus many unusual Samsung/mobile capability flags."}},

    getProfile: function(key, callback) {
        key = key || Devices.DEFAULT_MAS_PROFILE;
        var p = Devices.PROFILES[key] || Devices.PROFILES[Devices.DEFAULT_MAS_PROFILE];
        if (callback) callback({key:key, name:p.name, description:p.description, specs:JSON.stringify(p.specs)});
    },

    getSelectedProfile: function(callback) {
        try {
            BrowserStorage.get(Devices.MAS_PROFILE_STORAGE_KEY, function(saved) {
                var key = saved && saved[Devices.MAS_PROFILE_STORAGE_KEY];
                if (!Devices.PROFILES[key]) key = Devices.DEFAULT_MAS_PROFILE;
                Devices.getProfile(key, callback);
            });
        } catch (e) { Devices.getProfile(Devices.DEFAULT_MAS_PROFILE, callback); }
    },

    setSelectedProfile: function(key, callback) {
        if (!Devices.PROFILES[key]) key = Devices.DEFAULT_MAS_PROFILE;
        var o={}; o[Devices.MAS_PROFILE_STORAGE_KEY]=key;
        BrowserStorage.set(o, function(){ if(callback) callback(key); });
    },

    // Compatibility with the original extension API.
    get: function(a, b) { Devices.getSelectedProfile(b); },
    getAll: function(a) { BrowserStorage.get("devices", function(b) { if (a) a(b.devices || []); }); },
    save: function(a,b,c){ Devices.getAll(function(d){ if(d[a]){ d[a]=b; Devices.saveAll(d,c); } }); },
    saveAll: function(a,b){ BrowserStorage.set({devices:a},b); },
    add: function(a,b){ Devices.getAll(function(c){ c.push(a); Devices.saveAll(c,b); }); },
    remove: function(a,b){ Devices.getAll(function(c){ if(c[a]) c.splice(a,1); if(b)b(); }); }
};


/* v0.5.6 registration identity permutations derived from the historical AFTMM profile. */
(function() {
    function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
    var historical = Devices.PROFILES["aftmm-reported"];
    if (!historical) return;

    // Variant 2: keep the historical capability blob unchanged, but align the
    // outer MAS deviceType with the nested Amazon-style Dtid.
    var aligned = deepClone(historical);
    aligned.name = "AFTMM / mantis - A3GFS-aligned registration";
    aligned.description = "Same historical AFTMM capability payload, but both outer specs.deviceType and nested deviceInfo.deviceType are A3GFS040JDOGQR. Tests whether NS6268 was only a build identifier.";
    aligned.specs.deviceType = "A3GFS040JDOGQR";
    aligned.specs.deviceInfo.deviceType = "A3GFS040JDOGQR";
    Devices.PROFILES["aftmm-a3gfs-aligned"] = aligned;

    // Variant 3: align the device type and remove the most obvious Samsung/mobile
    // contamination while preserving the AFTMM/mantis/Fire-TV identity shell.
    var clean = deepClone(aligned);
    clean.name = "AFTMM / mantis - A3GFS-aligned cleaned Fire TV";
    clean.description = "A3GFS-aligned AFTMM/mantis profile with obvious Samsung/mobile-only capability flags removed and Fire-TV-inconsistent rooted/touch/NFC/camera flags disabled.";
    var d = clean.specs.deviceInfo;
    Object.keys(d).forEach(function(k) {
        if (k.indexOf("com.sec.") === 0 || k === "com.nxp.mifare" || k === "sharedLibraries") delete d[k];
    });
    d.isRooted = "false";
    d["android.hardware.telephony.gsm"] = "false";
    d["android.hardware.nfc"] = "false";
    d["android.hardware.nfc.hce"] = "false";
    d["android.hardware.touchscreen"] = "false";
    d["android.hardware.touchscreen.multitouch"] = "false";
    d["android.hardware.touchscreen.multitouch.distinct"] = "false";
    d["android.hardware.touchscreen.multitouch.jazzhand"] = "false";
    d["android.hardware.camera"] = "false";
    d["android.hardware.camera.any"] = "false";
    d["android.hardware.camera.front"] = "false";
    d["android.hardware.camera.flash"] = "false";
    d["android.hardware.camera.autofocus"] = "false";
    d["android.hardware.location.gps"] = "false";
    d.deviceTouchscreen = "TOUCHSCREEN_NOTOUCH";
    Devices.PROFILES["aftmm-a3gfs-clean"] = clean;
})();


/* v0.5.34: proven Minecraft-compatible Fire HD 8 (2022) profile.
 * Keep OAuth/auth registration identity separate. Normal downloads use the main
 * auth/register mac_dms credentials, register this profile directly with MAS,
 * then call getDownloadUrl with the baseline request.
 */
(function() {
    function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
    var base = Devices.PROFILES["aftmm-a3gfs-clean"] || Devices.PROFILES["firemax11"];
    if (!base) return;
    var p = deepClone(base);
    p.name = "Fire HD 8 (2022, 2GB) KFRAWI - Minecraft compatible";
    p.description = "Proven by v0.5.33 direct-MAS matrix to download Minecraft from Amazon Appstore using main auth/register mac_dms credentials.";
    p.specs.deviceType = "A1TD5Z1R8IWBHA";
    var d = p.specs.deviceInfo || (p.specs.deviceInfo = {});
    d.deviceType = "A1TD5Z1R8IWBHA";
    d.model = "KFRAWI";
    d.APILevel = "30";
    d.releaseVersion = "11";
    d["build.device"] = "raspite";
    d["build.product"] = "raspite";
    d["build.hardware"] = "raspite";
    d["build.board"] = "raspite";
    d["build.id"] = "RS8338.3339N";
    d.display = "RS8338.3339N";
    d["build.fingerprint"] = "Amazon/raspite/raspite:11/RS8338.3339N/candidate:user/amz-p,release-keys";
    d.cpuABI = "arm64-v8a";
    d["build.cpuABI2"] = "armeabi-v7a";
    d.openGlEsVersion = "0x00030002";
    d.deviceDisplayPixelsWidth = "1280";
    d.deviceDisplayPixelsHeight = "800";
    d["screenRealSize.width"] = "1280";
    d["screenRealSize.height"] = "800";
    d["screenSize.width"] = "1280";
    d["screenSize.height"] = "800";
    d.deviceDisplayXDpi = "213";
    d.deviceDisplayYDpi = "213";
    d.deviceDensityClassification = "213";
    d.deviceScreenLayout = "SCREENLAYOUT_SIZE_LARGE";
    d.deviceTouchscreen = "TOUCHSCREEN_FINGER";
    d["android.hardware.screen.portrait"] = "true";
    d["android.hardware.screen.landscape"] = "true";
    d["android.hardware.touchscreen"] = "true";
    d["android.hardware.touchscreen.multitouch"] = "true";
    d["android.hardware.touchscreen.multitouch.distinct"] = "true";
    d["android.hardware.touchscreen.multitouch.jazzhand"] = "true";
    d["android.hardware.faketouch"] = "true";
    d["android.hardware.camera"] = "true";
    d["android.hardware.camera.any"] = "true";
    d["android.hardware.camera.front"] = "true";
    d["android.hardware.camera.autofocus"] = "false";
    d["android.hardware.camera.flash"] = "false";
    d["android.hardware.location"] = "true";
    d["android.hardware.location.network"] = "true";
    d["android.hardware.location.gps"] = "false";
    d["android.hardware.sensor.accelerometer"] = "true";
    d["android.hardware.telephony"] = "false";
    d["android.hardware.telephony.gsm"] = "false";
    d.isPreloaded = "true";
    d.isRooted = "false";
    d.isEmulator = "false";
    d.capabilitiesCodeVersion = "2.0";
    Devices.PROFILES["firehd8-2022-kfrawi"] = p;
    Devices.DEFAULT_MAS_PROFILE = "firehd8-2022-kfrawi";
})();
