"use strict";

/*
 * MV3 offscreen signing helper.
 *
 * The original MV2 extension generated ADP RSA signatures in a normal
 * extension document. Chromium MV3 service workers have a different JS
 * runtime, and the legacy node-rsa bundle does not produce Amazon-compatible
 * results there consistently. This hidden extension document restores the
 * same DOM/window execution environment used by the working MV2 build.
 */
function signAmazonRequest(request, useLegacyAuth) {
    var timestamp = new Date(request.timestamp).toISOString().replace(/\.[0-9]+Z/, "Z");
    var parts = [
        request.method,
        request.path,
        timestamp,
        request.body || "",
        request.adpToken
    ];
    return RequestSigner.sign(request.privateKey, parts.join("\n"), useLegacyAuth) + ":" + timestamp;
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (!message || message.target !== "apk-offscreen-signer" || message.cmd !== "signRequest") return;
    try {
        var signature = signAmazonRequest(message.data, !!message.useLegacyAuth);
        sendResponse({ok:true, signature:signature});
    } catch (e) {
        sendResponse({ok:false, error:String(e && (e.stack || e.message) || e)});
    }
    return true;
});
