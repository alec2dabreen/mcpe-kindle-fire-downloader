# Privacy Policy

Last updated: September 11, 2026

APK Downloader for Minecraft: Kindle Fire Edition is an independently developed
Chrome extension written by Alec Breen. It is not affiliated with, endorsed by,
or sponsored by Amazon, Mojang, Microsoft, or Google.

## Single purpose

The extension allows a user who already owns an app through Amazon to
authenticate with Amazon, identify the current version offered on its Amazon
Appstore product page, and request the authorized APK from Amazon's Appstore
servers. It includes a dedicated one-click Options-page workflow for Minecraft:
Kindle Fire Edition.

## Information handled by the extension

To provide that function, the extension handles:

- the Amazon account display name returned by Amazon;
- an Amazon OAuth access token and Appstore device credentials returned after
  the user signs in;
- a randomly generated device serial, Amazon's registered-device name, and the
  fixed Minecraft-compatible Kindle Fire profile used for Appstore delivery;
- the ASIN and current numeric application version exposed by an Amazon Appstore
  product page when the user clicks Download APK; and
- technical status and sanitized error information for the current download
  attempt.

The user enters their Amazon password directly on Amazon's website. The
extension does not receive or store the password, payment information, browsing
history, personal communications, or financial information.

## How information is used and stored

Amazon authentication and device-registration information is stored only in
Chrome's local extension storage so that the user can remain signed in. It is
used only to register the compatible Appstore profile and request an APK that
Amazon authorizes for that account.

The extension reads Appstore details only from the Amazon product page on which
the user invokes Download APK. The Options-page Minecraft button checks the
known Minecraft listing at https://www.amazon.com/dp/B00992CF6W. The extension
does not monitor or retain the user's general browsing history.

The Current Download Debug Log is created in memory on the Options page, resets
at the start of each Download APK attempt, and is not automatically sent or
persisted. A user may voluntarily copy it into a GitHub issue when requesting
support.

## Sharing and transmission

The extension communicates directly with Amazon over HTTPS for sign-in, device
registration, product-version lookup, and authorized APK delivery. Alec Breen
does not operate an intermediary server and does not receive the user's Amazon
account information, credentials, product-page data, or download activity.

No information is sold, used for advertising, used for creditworthiness or
lending, or shared with data brokers. The extension contains no analytics or
tracking service.

## Retention and deletion

Locally stored Amazon authentication and device-registration information remains
until the user clicks Logout or uninstalls the extension. The user can also
clear it through Chrome's extension storage controls.

## Limited use

Information handled by the extension is limited to providing its clearly
disclosed, user-facing Amazon Appstore APK download function. It is not used or
transferred for unrelated purposes, personalized advertising, or human review,
except when a user voluntarily submits a sanitized debug log for support.

## Contact

Questions about this policy may be submitted through the project's GitHub
repository:

https://github.com/alec2dabreen/mcpe-kindle-fire-downloader
