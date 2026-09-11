"use strict";

var AppstoreWebService = function() {
    var friendlyErrors = {
        Unknown: "Unknown error",
        CustomerNotEntitledException: "You do not own this app/game.",
        DependentServiceException: "Amazon rejected the request as restricted or incompatible.",
        IncompatibleAppException: "Amazon says this app is not compatible with the registered device profile."
    };
    var self = this;

    function pathFromUrl(url) { return new URL(url).pathname; }
    function isWorker() { return typeof document === "undefined"; }

    this.withMethod = function(v) { self.method = v; return self; };
    this.withUrl = function(v) { self.url = v; return self; };
    this.withAdpToken = function(v) { self.adpToken = v; return self; };
    this.withPrivateKey = function(v) { self.privateKey = v; return self; };
    this.withContentType = function(v) { self.contentType = v; return self; };
    this.withBody = function(v) { self.body = v; return self; };
    this.onSuccess = function(v) { self.onSuccessCallback = v; return self; };
    this.onError = function(v) { self.onErrorCallback = v; return self; };
    this.useLegacyAuth = function(v) { self.legacyAuth = v; return self; };
    this.withDebugStage = function(v) { self.debugStage = v; return self; };
    this.withExtraHeaders = function(v) { self.extraHeaders = v || {}; return self; };
    this.withCredentials = function(v) { self.credentialsMode = v || "omit"; return self; };

    function sign(callback) {
        var request = {
            method: self.method,
            path: pathFromUrl(self.url),
            body: self.body || "",
            adpToken: self.adpToken,
            privateKey: self.privateKey,
            timestamp: +new Date(),
            debugStage: self.debugStage || "AppstoreWebService"
        };
        if (isWorker()) {
            if (typeof requestSignatureViaOffscreen === "function") {
                requestSignatureViaOffscreen(request, self.legacyAuth).then(function(signature) {
                    callback(signature);
                }).catch(function(err) {
                    var stage = self.debugStage || "AppstoreWebService";
                    var msg=String(err && err.message ? err.message : err);
                    var type=/timed out/i.test(msg)?"SigningTimeout":"SigningError";
                    APKDebug.log(stage, type === "SigningTimeout" ? "SIGNING_TIMEOUT" : "SIGNING_ERROR", {message:msg});
                    if (self.onErrorCallback) self.onErrorCallback(type, msg);
                });
            } else {
                callback(AppstoreUtils.signRequest(request, self.legacyAuth));
            }
        } else {
            AppstoreUtils.bgSignRequest(request, self.legacyAuth, callback);
        }
    }

    function authHeaders(signature) {
        var headers = {"Content-Type": self.contentType || "text/plain"};
        if (self.legacyAuth) {
            headers["X-ADP-Request-Digest"] = signature;
            headers["X-ADP-Authentication-Token"] = self.adpToken;
        } else {
            headers["x-adp-alg"] = "SHA256WithRSA:1.0";
            headers["x-adp-signature"] = signature;
            headers["x-adp-token"] = self.adpToken;
        }
        var extra = self.extraHeaders || {};
        Object.keys(extra).forEach(function(k) { if (extra[k] !== undefined && extra[k] !== null && extra[k] !== "") headers[k] = String(extra[k]); });
        return headers;
    }

    function handleResult(status, responseText, getHeader, context) {
        var stage = self.debugStage || "AppstoreWebService";
        var errorType = (getHeader("x-amzn-ErrorType") || "").split(":")[0];
        var requestId = getHeader("x-amzn-RequestId") || getHeader("x-amz-request-id") || "";
        if (status !== 200) {
            errorType = errorType || "Unknown";
            var message = friendlyErrors[errorType] || "Amazon returned HTTP " + status;
            APKDebug.log(stage, "HTTP_ERROR", {url:self.url,status:status,errorType:errorType,requestId:requestId,responseText:responseText});
            if (self.onErrorCallback) self.onErrorCallback(errorType, message, {
                httpStatus: status,
                requestId: requestId || null,
                rawResponse: APKDebug.sanitize(responseText || "")
            });
            return;
        }
        APKDebug.log(stage, "HTTP_SUCCESS", {url:self.url,status:status,requestId:requestId,contentType:getHeader("content-type") || "",responseText:responseText});
        if (self.onSuccessCallback) self.onSuccessCallback.call(context);
    }

    this.call = function() {
        sign(function(signature) {
            if (isWorker()) {
                var stage = self.debugStage || "AppstoreWebService";
                var controller = new AbortController();
                var requestTimeoutMs = 15000;
                var requestTimer = setTimeout(function(){ controller.abort(); }, requestTimeoutMs);
                APKDebug.log(stage, "HTTP_DISPATCH", {url:self.url,method:self.method,timeoutMs:requestTimeoutMs});
                fetch(self.url, {
                    method: self.method,
                    headers: authHeaders(signature),
                    body: (self.method === "GET" || self.method === "HEAD") ? undefined : (self.body || ""),
                    credentials: self.credentialsMode || "omit",
                    signal: controller.signal
                }).then(function(resp) {
                    clearTimeout(requestTimer);
                    return resp.text().then(function(text) {
                        var context = {
                            status: resp.status,
                            responseText: text,
                            responseXML: null,
                            getResponseHeader: function(name) { return resp.headers.get(name); }
                        };
                        handleResult(resp.status, text, function(name){ return resp.headers.get(name); }, context);
                    });
                }).catch(function(err) {
                    clearTimeout(requestTimer);
                    var stage = self.debugStage || "AppstoreWebService";
                    var aborted = err && (err.name === "AbortError" || /aborted/i.test(String(err)));
                    APKDebug.log(stage, aborted ? "HTTP_TIMEOUT" : "NETWORK_ERROR", {url:self.url,message:String(err),timeoutMs:requestTimeoutMs});
                    if (self.onErrorCallback) self.onErrorCallback(aborted ? "RequestTimeout" : "NetworkError", aborted ? "HTTP request timed out after " + requestTimeoutMs + " ms" : String(err));
                });
                return;
            }

            var xhr = new XMLHttpRequest();
            xhr.onload = function() {
                handleResult(xhr.status, xhr.responseText, function(name){ return xhr.getResponseHeader(name); }, xhr);
            };
            xhr.onerror = function() {
                var stage = self.debugStage || "AppstoreWebService";
                APKDebug.log(stage, "NETWORK_ERROR", {url:self.url});
                if (self.onErrorCallback) self.onErrorCallback("NetworkError", "Network error");
            };
            xhr.open(self.method, self.url, true);
            var headers = authHeaders(signature);
            Object.keys(headers).forEach(function(k){ xhr.setRequestHeader(k, headers[k]); });
            xhr.send(self.body || "");
        });
    };
};
