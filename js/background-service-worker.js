"use strict";

importScripts(
  "libs/sha256.js",
  "libs/node-rsa.js",
  "analytics.js",
  "browser-support.js",
  "appstore-utils.js",
  "devices.js",
  "debug-log.js",
  "appstore-webservice.js",
  "appstore-api.js",
  "background.js"
);

var offscreenCreating = null;

async function ensureSigningOffscreenDocument() {
    if (!chrome.offscreen) throw new Error("chrome.offscreen is unavailable in this Chromium build");

    if (chrome.offscreen.hasDocument) {
        if (await chrome.offscreen.hasDocument()) return;
    } else {
        var contexts = await chrome.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [chrome.runtime.getURL("offscreen.html")]
        });
        if (contexts && contexts.length) return;
    }

    if (offscreenCreating) return offscreenCreating;
    offscreenCreating = chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["DOM_PARSER"],
        justification: "Generate legacy Amazon ADP RSA signatures in a normal extension document, matching the original MV2 runtime."
    }).finally(function(){ offscreenCreating = null; });
    return offscreenCreating;
}

async function requestSignatureViaOffscreen(request, useLegacyAuth) {
    var stage = request && request.debugStage ? request.debugStage : "mv3.signer";
    var safeMeta = {
        authScheme: useLegacyAuth ? "legacy-adp" : "standard-adp",
        method: request && request.method || "",
        path: request && request.path || "",
        bodyLength: request && request.body ? String(request.body).length : 0,
        adpTokenPresent: !!(request && request.adpToken),
        privateKeyPresent: !!(request && request.privateKey),
        timestampPresent: !!(request && request.timestamp)
    };
    APKDebug.log(stage, "SIGN_START", safeMeta);
    var timeoutMs = 10000;
    try {
        await Promise.race([
            ensureSigningOffscreenDocument(),
            new Promise(function(_, reject){ setTimeout(function(){ reject(new Error("Offscreen document setup timed out after " + timeoutMs + " ms")); }, timeoutMs); })
        ]);
        var response = await Promise.race([
            chrome.runtime.sendMessage({
                target: "apk-offscreen-signer",
                cmd: "signRequest",
                data: request,
                useLegacyAuth: !!useLegacyAuth
            }),
            new Promise(function(_, reject){ setTimeout(function(){ reject(new Error("Offscreen signing timed out after " + timeoutMs + " ms")); }, timeoutMs); })
        ]);
        if (!response || !response.ok) throw new Error(response && response.error ? response.error : "Offscreen signer returned no signature");
        APKDebug.log(stage, "SIGN_SUCCESS", {authScheme:safeMeta.authScheme,signaturePresent:true});
        return response.signature;
    } catch (err) {
        var msg=String(err && err.message ? err.message : err);
        var action=/timed out/i.test(msg)?"SIGN_TIMEOUT":"SIGN_ERROR";
        APKDebug.log(stage, action, {authScheme:safeMeta.authScheme,message:msg});
        throw err;
    }
}

globalThis.requestSignatureViaOffscreen = requestSignatureViaOffscreen;

function recordRuntimeFault(kind, err, extra) {
    try {
        var message = String(err && err.message ? err.message : err || "Unknown runtime fault");
        var stack = err && err.stack ? String(err.stack).substring(0, 12000) : "";
        var record = {
            time: new Date().toISOString(),
            kind: kind,
            message: message,
            stack: stack,
            extra: extra || {}
        };
        console.error("[APK RUNTIME FAULT]", record);
        chrome.storage.local.set({apk_debug_runtime_fault: record});
        try { APKDebug.log("runtime", kind, record); } catch (_) {}
    } catch (_) {}
}

globalThis.addEventListener("error", function(event) {
    recordRuntimeFault("SERVICE_WORKER_ERROR", event && event.error ? event.error : (event && event.message ? event.message : "error event"), {
        filename: event && event.filename || "",
        lineno: event && event.lineno || 0,
        colno: event && event.colno || 0
    });
});

globalThis.addEventListener("unhandledrejection", function(event) {
    recordRuntimeFault("UNHANDLED_REJECTION", event ? event.reason : "unhandled rejection", {});
});

globalThis.recordRuntimeFault = recordRuntimeFault;

