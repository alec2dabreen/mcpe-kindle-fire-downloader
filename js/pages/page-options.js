"use strict";

(function() {
    var MINECRAFT_ASIN = "B00992CF6W";
    var MINECRAFT_PAGE = "https://www.amazon.com/dp/" + MINECRAFT_ASIN;
    var attemptLog = [];

    function resetAttemptLog() {
        attemptLog = [];
        appendAttemptLog("attempt.started", {
            time: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version,
            targetAsin: MINECRAFT_ASIN,
            versionStrategy: "live Amazon appVersionNo; no fallback"
        });
    }

    function appendAttemptLog(stage, details) {
        attemptLog.push({stage:stage, time:new Date().toISOString(), details:details || {}});
        var box = document.getElementById("current-download-debug-log");
        if (box) box.value = JSON.stringify(attemptLog, null, 2);
    }

    function validVersion(value) {
        value = String(value || "").trim();
        return /^\d{1,12}$/.test(value) ? value : "";
    }

    function resolveMinecraftVersion() {
        appendAttemptLog("version.lookup.started", {url:MINECRAFT_PAGE});
        return fetch(MINECRAFT_PAGE, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            redirect: "follow"
        }).then(function(response) {
            appendAttemptLog("version.lookup.http", {
                status: response.status,
                ok: response.ok,
                finalUrl: response.url,
                contentType: response.headers.get("content-type") || ""
            });
            if (!response.ok) throw new Error("Amazon returned HTTP " + response.status + " while checking the Minecraft listing.");
            return response.text();
        }).then(function(html) {
            var documentCopy = new DOMParser().parseFromString(html, "text/html");
            var selectors = [
                '#handleBuy input[name="appVersionNo"]',
                'form input[name="appVersionNo"]'
            ];
            var forms = documentCopy.querySelectorAll("form");
            for (var f = 0; f < forms.length; f++) {
                var asinField = forms[f].querySelector('input[name="asin"]');
                var versionField = forms[f].querySelector('input[name="appVersionNo"]');
                if (asinField && String(asinField.value || "").toUpperCase() === MINECRAFT_ASIN && versionField) {
                    var formVersion = validVersion(versionField.value || versionField.getAttribute("value"));
                    if (formVersion) {
                        appendAttemptLog("version.resolved", {version:formVersion, source:"matching Minecraft purchase form"});
                        return formVersion;
                    }
                }
            }
            for (var i = 0; i < selectors.length; i++) {
                var field = documentCopy.querySelector(selectors[i]);
                var value = field && validVersion(field.value || field.getAttribute("value"));
                if (value) {
                    appendAttemptLog("version.resolved", {version:value, source:selectors[i]});
                    return value;
                }
            }

            var patterns = [
                /name=["']appVersionNo["'][^>]{0,500}value=["'](\d{1,12})["']/i,
                /value=["'](\d{1,12})["'][^>]{0,500}name=["']appVersionNo["']/i,
                /["']appVersionNo["']\s*[:=]\s*["'](\d{1,12})["']/i,
                /\\"appVersionNo\\"\s*:\s*\\"(\d{1,12})\\"/i
            ];
            for (var j = 0; j < patterns.length; j++) {
                var match = html.match(patterns[j]);
                var fallback = match && validVersion(match[1]);
                if (fallback) {
                    appendAttemptLog("version.resolved", {version:fallback, source:"embedded listing metadata pattern " + (j + 1)});
                    return fallback;
                }
            }
            throw new Error("Amazon did not expose a current Minecraft version. No older version was used.");
        });
    }

    function showUser(user) {
        document.querySelector("section.section-info").style.display = "block";
        document.getElementById("current-download-debug").style.display = "block";
        document.getElementById("txt-customer-name").textContent = user.name || "Signed in";
        document.getElementById("txt-device-name").textContent = user.device.device_name || "Registered Kindle Fire";
        var debugBox = document.getElementById("current-download-debug-log");
        debugBox.value = "No download attempt has been made on this page.";
        document.getElementById("btn-copy-current-debug").addEventListener("click", function(event) {
            event.preventDefault();
            var copyButton = event.currentTarget;
            var text = debugBox.value;
            var copied = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("Clipboard API unavailable"));
            copied.catch(function() {
                debugBox.focus();
                debugBox.select();
                document.execCommand("copy");
            }).then(function() {
                copyButton.textContent = "Copied";
                setTimeout(function() { copyButton.textContent = "Copy Debug Log"; }, 1200);
            });
        });
        document.getElementById("btn-download-minecraft").addEventListener("click", function(event) {
            event.preventDefault();
            var button = event.currentTarget;
            var status = document.getElementById("download-status");
            resetAttemptLog();
            button.disabled = true;
            button.textContent = "Finding latest version...";
            status.textContent = "Checking the live Minecraft listing on Amazon...";
            resolveMinecraftVersion().then(function(version) {
                appendAttemptLog("download.request.started", {asin:MINECRAFT_ASIN, appVersionNo:version});
                button.textContent = "Requesting APK...";
                status.textContent = "Requesting Minecraft version " + version + " from Amazon...";
                BrowserMessage.sendMessage({cmd:"download", data:{asin:MINECRAFT_ASIN, appVersionNo:version}}, function(response) {
                    button.disabled = false;
                    button.textContent = "Download APK";
                    if (!response) {
                        appendAttemptLog("download.response.missing", {message:"No response was received from the extension background service."});
                        status.textContent = "No response was received from the extension.";
                        return;
                    }
                    if (response.error) {
                        appendAttemptLog("download.failed", {
                            errorType: response.error.type || "Unknown",
                            message: response.error.message || "Amazon did not authorize the download.",
                            requestedVersion: version
                        });
                        status.textContent = "Download failed: " + (response.error.message || response.error.type || "Amazon did not authorize the download.");
                        return;
                    }
                    appendAttemptLog("download.started", {
                        requestedVersion: version,
                        deliveredVersion: response.version || null,
                        variant: response.variant || null,
                        profileKey: response.profileKey || null
                    });
                    status.textContent = "Minecraft version " + version + " download started.";
                });
            }).catch(function(error) {
                button.disabled = false;
                button.textContent = "Download APK";
                appendAttemptLog("attempt.failed", {
                    errorName: error && error.name ? error.name : "Error",
                    message: error && error.message ? error.message : "The latest Minecraft version could not be determined."
                });
                status.textContent = error && error.message ? error.message : "The latest Minecraft version could not be determined.";
            });
        });
        document.getElementById("btn-logout").addEventListener("click", function(event) {
            event.preventDefault();
            if (!confirm("Log out and clear the synthetic device registration from this extension?")) return;
            BrowserStorage.remove("user", function() {
                BrowserStorage.remove("global_device_serial", function() {
                    BrowserStorage.remove("devices", function() { window.location.reload(); });
                });
            });
        });
    }

    function showLogin() {
        document.querySelector("section.section-login").style.display = "block";
        document.getElementById("btn-oa2").addEventListener("click", function(event) {
            event.preventDefault();
            AppstoreUtils.getDeviceSerial(function(serial) {
                AppstoreUtils.getAuthIdentity(function(identity) {
                    var clientId = AppstoreUtils.getOa2ClientId(serial, identity.deviceType || AppstoreUtils.DEVICE_TYPE_MAIN);
                    var parameters = {
                        "openid.oa2.client_id": clientId,
                        "openid.oa2.response_type": "token",
                        "openid.ns.pape": "http://specs.openid.net/extensions/pape/1.0",
                        pageId: "amzn_device_common_light",
                        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
                        "openid.assoc_handle": "amzn_appshop_android_us",
                        disableLoginPrepopulate: 1,
                        accountStatusPolicy: "P1",
                        "openid.pape.max_auth_age": 0,
                        "openid.ns.oa2": "http://www.amazon.com/ap/ext/oauth/2",
                        "openid.ns": "http://specs.openid.net/auth/2.0",
                        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
                        "openid.mode": "checkid_setup",
                        "openid.oa2.scope": "device_auth_access",
                        "openid.return_to": "https://www.amazon.com/gp/yourstore/home"
                    };
                    var query = Object.keys(parameters).map(function(key) {
                        return key + "=" + encodeURIComponent(parameters[key]);
                    }).join("&");
                    window.location.href = AppstoreAPI.API_OAUTH2_SIGNIN + "?" + query;
                });
            });
        });
    }

    BrowserStorage.get("user", function(saved) {
        var user = saved && saved.user ? saved.user : {};
        if (AppstoreUtils.isValidUser(user)) showUser(user);
        else BrowserStorage.remove("user", showLogin);
    });
})();
