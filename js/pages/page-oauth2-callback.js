"use strict";
(function() {
    function markStep(step) {
        var el = document.querySelector(".steps li:nth-child(" + step + ")");
        if (el) el.classList.add("color");
    }

    function returnToOptions(message) {
        APKDebug.log("oauth2", "LOGIN_ABORT", {message: message || "Unknown login error"});
        try { alert(message || "Amazon login could not be completed. Please try again."); } catch (e) {}
        window.location.hash = "#";
        setTimeout(function() { window.location.href = chrome.runtime.getURL("options.html"); }, 500);
    }

    function begin(accessToken, deviceSeed) {
        markStep(1);
        var user = {
            access_token: accessToken,
            device: {
                device_serial: deviceSeed.device_serial,
                device_model: deviceSeed.device_model,
                os_version: deviceSeed.os_version
            }
        };
        AppstoreAPI.register(user, onMainRegistered, function(errorType, message) {
            APKDebug.log("auth/register", "LOGIN_STAGE_FAILED", {errorType:errorType || "Unknown", message:message || ""});
            returnToOptions("Amazon accepted the sign-in page but the main device registration failed. Please try Login again.");
        });
    }

    function onMainRegistered(user, response) {
        markStep(2);
        if (!response || response.error || !response.success) {
            returnToOptions("Amazon did not return usable device credentials. Please try Login again.");
            return;
        }
        var success = response.success;
        var tokens = success.tokens || {};
        var extensions = success.extensions || {};
        if (!tokens.mac_dms || !extensions.customer_info || !extensions.device_info) {
            returnToOptions("Amazon returned an incomplete registration response. Please try Login again.");
            return;
        }

        user.name = extensions.customer_info.name;
        user.device.main_device_private_key = tokens.mac_dms.device_private_key;
        user.device.main_adp_token = tokens.mac_dms.adp_token;
        user.device.device_name = extensions.device_info.device_name;
        user.device.appstore_credential_source = "main_mac_dms_direct";
        user.device.appstore_auth_scheme = "legacy-adp";

        registerDirectWithMas(user);
    }

    function registerDirectWithMas(user) {
        markStep(3);
        Devices.get(0, function(profile) {
            if (!profile) {
                returnToOptions("The local Fire Max 11 profile is missing.");
                return;
            }

            APKDebug.log("directMAS", "START", {
                endpoint: AppstoreAPI.API_APPSTORE_ONLY_REGISTER_DEVICE,
                masProfileKey: profile.key || "unknown",
                masProfileName: profile.name || "unknown",
                credentialSource: "auth/register mac_dms",
                authScheme: "legacy-adp",
                profileModel: AppstoreUtils.DEVICE_MODEL,
                profileApiLevel: AppstoreUtils.OS_VERSION,
                firsAssociatedStage: "removed"
            });

            AppstoreAPI.appstoreOnlyRegisterDevice(
                profile.specs,
                user.device.main_adp_token,
                user.device.main_device_private_key,
                function() {
                    // Keep the old field names as compatibility aliases for the rest of
                    // the extension, but they now point to the primary mac_dms pair.
                    user.device.mas_profile_key = profile.key || "unknown";
                    user.device.mas_profile_name = profile.name || "unknown";
                    try { var parsedProfile=JSON.parse(profile.specs); user.device.mas_profile_device_type=parsedProfile.deviceType || (parsedProfile.deviceInfo && parsedProfile.deviceInfo.deviceType) || null; user.device.mas_profile_model=parsedProfile.deviceInfo && parsedProfile.deviceInfo.model || null; } catch(e) {}
                    user.device.associated_device_private_key = user.device.main_device_private_key;
                    user.device.associated_adp_token = user.device.main_adp_token;
                    BrowserStorage.get(["appstore_device_descriptor_id","appstore_identity_x_cookie"],function(bindings){
                    user.device.main_device_descriptor_id=(bindings&&bindings.appstore_device_descriptor_id)||"";
                    user.device.main_identity_x_cookie=(bindings&&bindings.appstore_identity_x_cookie)||"";
                    user.device.delivery_credential_mode="main";
                    BrowserStorage.set({user: user, last_partial_user: null}, function() {
                        APKDebug.log("directMAS", "ACCEPTED", {
                            credentialSource: "auth/register mac_dms",
                            authScheme: "legacy-adp",
                            activeDownloadCredential: "main_mac_dms",
                            firsAssociatedStage: "not-used"
                        });
                        finishLogin();
                    });
                    });
                },
                function(errorType, message) {
                    APKDebug.log("directMAS", "REJECTED", {
                        errorType: errorType || "Unknown",
                        message: message || "",
                        credentialSource: "auth/register mac_dms"
                    });
                    returnToOptions("Amazon login succeeded, but direct MAS registration rejected the main mac_dms credentials. Refresh Log for details.");
                },
                true,
                "directMAS.appstoreOnlyRegisterDevice"
            );
        });
    }

    function finishLogin() {
        markStep(4);
        window.location.hash = "#";
        setTimeout(function() { window.location.href = chrome.runtime.getURL("options.html"); }, 1000);
    }

    function parseHash(raw) {
        var plus = /\+/g, rx = /([^&=]+)=?([^&]*)/g;
        var decode = function(s) { return decodeURIComponent(s.replace(plus, " ")); };
        var out = {}, m;
        while ((m = rx.exec(raw)) !== null) out[decode(m[1])] = decode(m[2]);
        return out;
    }

    var hash = window.location.hash;
    if (!hash) {
        var invalid = document.querySelector(".invalid");
        if (invalid) invalid.style.display = "block";
        return;
    }
    var params = parseHash(hash.substring(1));
    if (params["openid.oa2.access_token"] && params["openid.oa2.scope"] === "device_auth_access" && params["openid.oa2.token_type"] === "bearer") {
        var valid = document.querySelector(".valid");
        if (valid) valid.style.display = "block";
        var token = params["openid.oa2.access_token"];
        AppstoreUtils.getDeviceSerial(function(serial) {
            begin(token, {device_serial: serial, device_model: AppstoreUtils.DEVICE_MODEL, os_version: AppstoreUtils.OS_VERSION});
        });
    } else {
        var invalid2 = document.querySelector(".invalid");
        if (invalid2) invalid2.style.display = "block";
    }
})();
