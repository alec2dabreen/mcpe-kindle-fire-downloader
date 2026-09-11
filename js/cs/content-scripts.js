"use strict";

(function() {
    function isAppDetailPage() {
        var nav = document.getElementById("nav-subnav");
        var navIsAppstore = nav && nav.getAttribute("data-category") === "mobile-apps";
        var storeMeta = document.querySelector('meta[name="appstore:store_id"]');
        var context = document.getElementById("rufus-view-context");
        var isMasDetail = context && context.value && context.value.indexOf("MASDetailPage") !== -1;
        return !!(storeMeta || (navIsAppstore && isMasDetail));
    }

    function getAsin() {
        var meta = document.querySelector('meta[name="appstore:store_id"]');
        if (meta && meta.content) return meta.content;
        var match = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        return match ? match[1] : "";
    }

    function makeDownloadButton() {
        var button = document.createElement("button");
        button.id = "amazon-apk-downloader-button";
        button.type = "button";
        button.textContent = "Download APK";
        button.style.cssText = [
            "display:block", "width:100%", "max-width:320px", "margin:14px 0", "padding:10px 16px",
            "background:#ffd814", "border:1px solid #fcd200", "border-radius:20px", "cursor:pointer",
            "font-size:14px", "line-height:20px", "color:#0f1111"
        ].join(";");
        return button;
    }

    if (!isAppDetailPage() || document.getElementById("amazon-apk-downloader-button")) return;

    var asin = getAsin();
    if (!asin) return;

    var button = makeDownloadButton();
    button.addEventListener("click", function(event) {
        event.preventDefault();
        button.disabled = true;
        button.textContent = "Requesting APK...";
        var versionInput = document.querySelector('#handleBuy [name="appVersionNo"]');
        var appVersionNo = versionInput ? String(versionInput.value || "").trim() : "";
        if (!/^\d{1,12}$/.test(appVersionNo)) {
            button.disabled = false;
            button.textContent = "Download APK";
            alert("Amazon did not expose a current numeric app version on this page. No older fallback version was used.");
            return;
        }

        BrowserMessage.sendMessage({cmd:"download", data:{asin:asin, appVersionNo:appVersionNo}}, function(response) {
            button.disabled = false;
            button.textContent = "Download APK";
            if (!response) {
                alert("ERROR: No response from the extension.");
                return;
            }
            if (response.error) {
                if (response.error.type === "NotLoggedIn") {
                    alert("Please log in first.");
                    BrowserMessage.sendMessage({cmd:"openPage", page:"options"});
                } else {
                    alert("ERROR: " + (response.error.message || "No additional message returned by Amazon.") + " (" + response.error.type + ")");
                }
            }
        });
    });

    var target = document.getElementById("buybox") || document.getElementById("desktop_buybox") ||
        document.getElementById("rightCol") || document.getElementById("centerCol") ||
        document.getElementById("title") || document.body;
    if (target === document.body) document.body.insertBefore(button, document.body.firstChild);
    else target.appendChild(button);
})();
