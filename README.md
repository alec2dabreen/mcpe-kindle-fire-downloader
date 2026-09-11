# APK Downloader Browser Extension for Minecraft: Kindle Fire Edition

Version 1.0

This browser extension downloads the Kindle Fire edition of Minecraft from the Amazon
Appstore account that owns it.

It may also work with other APKs. If you visit the app's page on Amazon, there will be a "Download APK" button at the top of the page. Some work, some don't. The only one I'm really concerned with is Minecraft.

## Ownership requirement

The Amazon account used to log in to this extension **must have already purchased
Minecraft**. The extension does not purchase Minecraft or bypass Amazon's
ownership check.

Use the [Minecraft page on Amazon](https://www.amazon.com/dp/B00992CF6W) to check
whether the account owns the app or to purchase it before using the extension.

## Downloading Minecraft

1. Open the extension's Options page.
2. Log in with the Amazon account that already owns Minecraft.
3. Click **Download APK**.

Before downloading, the extension reads the live Minecraft app page on Amazon
and attempts to determine the latest available version. It extracts Amazon's
current numeric `appVersionNo` and uses that value for the download. If the live
version cannot be determined, it stops rather than silently using an older
hard-coded version.

Amazon Appstore product pages also show one extension control: **Download APK**.

## ARM32 and emulator notes

The downloaded file will be an ARM32 APK. If your device does not support ARM32,
you will need to run it in an emulator such as
[BlueStacks](https://www.bluestacks.com/).

The emulator will also need the Amazon Appstore installed. It can be found on
sites such as [APKMirror](https://www.apkmirror.com/). If the Amazon Appstore
version you download will not sideload correctly, try going backwards one
version at a time until you find a working version. Only download APKs from
sources you trust.

## Troubleshooting

If the version lookup or APK download fails, the details appear in the **Current
Download Debug Log** at the bottom of Options. The log is reset at the beginning
of every **Download APK** click and is kept only in the current Options page—not
extension storage.

Copy the log and include it in a new report on the
[GitHub Issues page](https://github.com/alec2dabreen/mcpe-kindle-fire-downloader/issues).

The proven Minecraft route remains unchanged:

`main auth/register mac_dms -> direct MAS appstoreOnlyRegisterDevice using the KFRAWI / A1TD5Z1R8IWBHA identity -> baseline getDownloadUrl`

Written by Alec Breen | TheBreenis.

<https://github.com/alec2dabreen/mcpe-kindle-fire-downloader>

Released under the MIT License. Feel free to fork. Fork away, as they say.
