# Android testing

Home Suite Home now includes a Capacitor Android shell in:

- `/Users/nathanjohnson/Documents/Projects/sweet/web/android`

## Build inputs

For Android, the web bundle must point to a server URL your phone can actually reach. Use a reachable LAN or public URL, not `localhost`.

Example:

```sh
cd /Users/nathanjohnson/Documents/Projects/sweet/web
VITE_API_BASE_URL=http://192.168.1.50:8080 npm run mobile:apk:debug
```

## Available scripts

From `/Users/nathanjohnson/Documents/Projects/sweet/web`:

```sh
npm run mobile:sync:android
npm run mobile:android
npm run mobile:apk:debug
```

## Expected local requirements

To produce an APK on a machine, you still need:

- Java/JDK
- Android SDK
- Android platform/build-tools accepted and installed

If Android Studio is installed, the simplest flow is:

```sh
npm run mobile:sync:android
npm run mobile:android
```

Then use Android Studio to run on a connected device.

## Debug APK output

When Gradle succeeds, the debug APK is typically created at:

- `/Users/nathanjohnson/Documents/Projects/sweet/web/android/app/build/outputs/apk/debug/app-debug.apk`
