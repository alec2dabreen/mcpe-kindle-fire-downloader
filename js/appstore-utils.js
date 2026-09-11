"use strict";

/*
 * Amazon Fire Max 11 (2023, 13th Gen)
 * Build model: KFSNWI / codename sunstone
 * Amazon device type: A2QCPPMSOLGVZE
 * Fire OS 8 / Android 11 / API 30
 *
 * v0.4.9 no longer calls the legacy FIRS registerAssociatedDevice endpoint.
 * DEVICE_TYPE_ASSOCIATED is retained only as a historical/debug identifier so
 * older diagnostics remain comparable. Active MAS and download credentials are
 * the mac_dms pair returned by auth/register.
 */
var AppstoreUtils = {
    APP_NAME: "com.amazon.venezia",
    APP_VERSION: "110037310",
    OS_VERSION: "30",
    DEVICE_MODEL: "KFSNWI",
    DEVICE_TYPE_MAIN: "A1MPSLFC7L5AFK",
    DEVICE_TYPE_ASSOCIATED: "A3GFS040JDOGQR",
    AUTH_IDENTITY_STORAGE_KEY: "apk_auth_identity",

    getAuthIdentity: function(callback) {
        var fallback = {preset:"legacy", deviceType:"A1MPSLFC7L5AFK", deviceModel:"defaultDeviceName", osVersion:"defaultOsVersion"};
        try {
            BrowserStorage.get(AppstoreUtils.AUTH_IDENTITY_STORAGE_KEY, function(saved) {
                var v = saved && saved[AppstoreUtils.AUTH_IDENTITY_STORAGE_KEY];
                if (!v || !v.deviceType) v = fallback;
                callback && callback(v);
            });
        } catch (e) { callback && callback(fallback); }
    },

    signRequest: function(a, b) {
        var c = new Date(a.timestamp).toISOString().replace(/\.[0-9]+Z/, "Z"),
            d = [a.method, a.path, c, a.body, a.adpToken];
        return RequestSigner.sign(a.privateKey, d.join("\n"), b) + ":" + c;
    },

    bgSignRequest: function(a, b, c) {
        BrowserMessage.sendMessage({cmd: "signRequest", data: a, useLegacyAuth: b}, c);
    },

    getPid: function(a) {
        if (typeof jsSHA !== "function") {
            throw new Error("jsSHA is not available for FIRS PID generation");
        }
        try {
            APKDebug.log("deliveryIdentity.pid", "HASHER_READY", {
                jsSHAPresent: true,
                inputLength: String(a || "").length
            });
        } catch (_) {}
        var b = new jsSHA(a, "TEXT");
        var pid = b.getHash("SHA-256", "HEX").substring(23, 31).toUpperCase();
        try { APKDebug.log("deliveryIdentity.pid", "PID_GENERATED", {pidPresent: !!pid}); } catch (_) {}
        return pid;
    },

    getDeviceSerial: function(callback, forceNew) {
        BrowserStorage.get("global_device_serial", function(data) {
            if (!forceNew && data && data.global_device_serial) {
                callback && callback(data.global_device_serial);
            } else {
                var serial = AppstoreUtils.generateDeviceSerial();
                BrowserStorage.set({global_device_serial: serial}, function() {
                    callback && callback(serial);
                });
            }
        });
    },

    generateDeviceSerial: function() {
        return window.uuid.v4().replace(/\-/g, "");
    },

    stringToHex: function(a) {
        var b = "";
        for (var c = 0, d = a.length; c < d; c++) b += a.charCodeAt(c).toString(16);
        return b;
    },

    getOa2ClientId: function(a, b) {
        return "device:" + AppstoreUtils.stringToHex(a + "#" + b);
    },

    isValidUser: function(a) {
        return AppstoreUtils.containKeys(a, ["access_token", "device"]) &&
            AppstoreUtils.containKeys(a.device, [
                "device_model",
                "device_serial",
                "main_adp_token",
                "main_device_private_key"
            ]);
    },

    containKeys: function(a, b) {
        var keys = Object.keys(a);
        for (var i = 0; i < b.length; i++) {
            if (keys.indexOf(b[i]) === -1) {
                console.log("containValues: missing " + b[i]);
                return false;
            }
        }
        return true;
    }
};
