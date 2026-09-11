"use strict";

var APKDebug = (function() {
    var STORAGE_KEY = "apk_debug_log";
    var LAST_METADATA_KEY = "apk_debug_last_metadata";
    var MAX_ENTRIES = 300;
    var queue = [];
    var writing = false;

    function cloneSafe(value) {
        try { return JSON.parse(JSON.stringify(value)); }
        catch (e) { return String(value); }
    }

    function redactText(text) {
        if (text === undefined || text === null) return text;
        var s = String(text);
        s = s.replace(/<(adp_token|device_private_key|authToken|deviceSerialNumber)>[\s\S]*?<\/\1>/gi,
            function(_, tag) { return "<" + tag + ">[REDACTED]</" + tag + ">"; });
        s = s.replace(/("?(?:access_token|adp_token|device_private_key|privateKey|associated_adp_token|associated_device_private_key|main_adp_token|main_device_private_key|device_serial|global_device_serial)"?\s*:\s*")([^"]+)(")/gi,
            "$1[REDACTED]$3");
        s = s.replace(/(X-ADP-(?:Authentication-Token|Request-Digest)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
        s = s.replace(/(x-adp-(?:token|signature)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
        s = s.replace(/https?:\/\/[^\s"']+/gi, function(url) {
            try {
                var u = new URL(url);
                if (/download|apk|amazon/i.test(url) && u.search) return u.origin + u.pathname + "?[QUERY_REDACTED]";
            } catch (e) {}
            return url;
        });
        return s;
    }

    function sanitize(value) {
        if (typeof value === "string") return redactText(value);
        var safe = cloneSafe(value);
        if (!safe || typeof safe !== "object") return safe;
        function walk(obj) {
            Object.keys(obj).forEach(function(k) {
                if (/token|private.?key|signature|access.?token|device.?serial/i.test(k)) obj[k] = "[REDACTED]";
                else if (typeof obj[k] === "string") obj[k] = redactText(obj[k]);
                else if (obj[k] && typeof obj[k] === "object") walk(obj[k]);
            });
        }
        walk(safe);
        return safe;
    }

    function pump() {
        if (writing || !queue.length) return;
        writing = true;
        var entry = queue.shift();
        try {
            chrome.storage.local.get(STORAGE_KEY, function(data) {
                var entries = data && data[STORAGE_KEY] ? data[STORAGE_KEY] : [];
                entries.push(entry);
                if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
                var obj = {}; obj[STORAGE_KEY] = entries;
                chrome.storage.local.set(obj, function() {
                    writing = false;
                    pump();
                });
            });
        } catch (e) {
            writing = false;
            console.warn("APKDebug storage failure", e);
            pump();
        }
    }

    function write(entry) { queue.push(entry); pump(); }

    function log(stage, direction, data) {
        var entry = {time:new Date().toISOString(), stage:stage, direction:direction, data:sanitize(data)};
        console.log("[APK DEBUG]", stage, direction, entry.data);
        write(entry);
    }

    function setLastMetadata(data, callback) {
        var obj = {}; obj[LAST_METADATA_KEY] = sanitize(data);
        chrome.storage.local.set(obj, callback);
    }
    function getLastMetadata(callback) {
        chrome.storage.local.get(LAST_METADATA_KEY, function(data) { callback((data && data[LAST_METADATA_KEY]) || null); });
    }
    function clear(callback) {
        queue = [];
        chrome.storage.local.remove([STORAGE_KEY, LAST_METADATA_KEY, "apk_debug_last_order_binding_probe", "apk_debug_order_binding_retry_started", "apk_debug_last_paramount_compatibility_probe", "apk_debug_last_account_probe", "apk_debug_last_retail_probe", "apk_debug_pending_order", "apk_debug_last_order_result", "apk_debug_runtime_fault", "apk_debug_delivery_checkpoint", "apk_debug_last_variant_discovery", "apk_debug_last_version_sweep", "apk_debug_last_account_delivery_trace", "apk_debug_last_retail_variant_trace", "apk_debug_compatibility_captures", "apk_debug_download_results", "apk_debug_last_device_account_matrix", "apk_debug_last_associated_type_matrix", "apk_debug_last_capability_sensitivity_matrix", "apk_debug_last_model_compatibility_matrix"], callback);
    }
    function get(callback) { chrome.storage.local.get(STORAGE_KEY, function(data){ callback((data && data[STORAGE_KEY]) || []); }); }
    function format(entries) {
        var header = [
            "APK Downloader for Amazon Appstore - Debug Log",
            "Build: 1.0-minecraft-kindle-fire-edition",
            "Secrets, tokens, private keys and device serials are redacted automatically.",
            ""
        ].join("\n");
        return header + entries.map(function(e){ return "["+e.time+"] "+e.stage+" "+e.direction+"\n"+JSON.stringify(e.data,null,2); }).join("\n\n");
    }
    return {log:log, clear:clear, get:get, format:format, sanitize:sanitize, setLastMetadata:setLastMetadata, getLastMetadata:getLastMetadata};
})();
