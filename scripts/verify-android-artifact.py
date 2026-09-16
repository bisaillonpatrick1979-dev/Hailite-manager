"""Inspect the actual bundle and merged manifest, including SDK dependencies."""
import argparse
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
from zipfile import ZipFile


def verify(bundle, manifest, require_signed=False):
    ns = '{http://schemas.android.com/apk/res/android}'
    root = ET.parse(manifest).getroot()
    assert root.get('package') == 'ca.hailite.manager', 'Unexpected application ID'
    sdk = root.find('uses-sdk')
    assert sdk is not None and int(sdk.get(ns + 'targetSdkVersion', '0')) >= 36, 'Target API 36 is required'
    app = root.find('application')
    assert app is not None, 'Missing application manifest'
    assert app.get(ns + 'debuggable', 'false') == 'false', 'Release must not be debuggable'
    assert app.get(ns + 'usesCleartextTraffic') == 'false', 'Cleartext traffic must be disabled'
    assert app.get(ns + 'allowBackup') == 'false', 'Unprotected Android backup must be disabled'
    assert 0 < int(root.get(ns + 'versionCode', '0')) <= 2100000000, 'Invalid versionCode'
    forbidden = {
        'ACCESS_BACKGROUND_LOCATION', 'MANAGE_EXTERNAL_STORAGE', 'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'QUERY_ALL_PACKAGES',
        'READ_CONTACTS', 'READ_SMS', 'REQUEST_INSTALL_PACKAGES', 'AD_ID'
    }
    permissions = {node.get(ns + 'name', '') for node in root.findall('uses-permission')}
    assert not {p for p in permissions if p.rsplit('.', 1)[-1] in forbidden}, 'Unexpected sensitive permission in merged manifest'
    with ZipFile(bundle) as archive:
        names = archive.namelist()
        # Source-only jniLibs checks miss .so files supplied inside dependencies.
        # This Java-only app needs no native binary. Fail if an SDK adds one;
        # its 64-bit ABIs, ELF and ZIP 16 KB alignment must then be assessed.
        native = [name for name in names if name.endswith('.so')]
        assert not native, f'Native libraries require 64-bit and 16 KB alignment review: {native}'
        assert 'base/assets/public/index.html' in names, 'Missing bundled interface'
        provenance = json.loads(archive.read('base/assets/public/build-provenance.json'))
        assert provenance == {'mode': 'mobile', 'trial': False}, 'Wrong build mode or trial expiration in sale bundle'
        config = json.loads(archive.read('base/assets/capacitor.config.json'))
        assert not config.get('server', {}).get('url'), 'Remote WebView URL is forbidden in this release'
        assert not config.get('android', {}).get('webContentsDebuggingEnabled'), 'WebView debugging enabled'
        signed = any(name.startswith('META-INF/') and name.endswith(('.RSA', '.DSA', '.EC')) for name in names)
        if require_signed:
            assert signed, 'Unsigned AAB cannot be submitted to Google Play'
            result = subprocess.run(['jarsigner', '-J-Duser.language=en', '-verify', str(bundle)], capture_output=True, text=True, check=False)
            assert result.returncode == 0 and 'jar verified.' in result.stdout, 'AAB signature verification failed'
    return {'applicationId': root.get('package'), 'versionCode': root.get(ns + 'versionCode'),
            'targetSdk': sdk.get(ns + 'targetSdkVersion'), 'permissions': sorted(permissions),
            'nativeLibraries': 0, 'signaturePresent': signed,
            'signatureVerified': require_signed, 'mode': 'mobile', 'trial': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, default=Path('android/app/build/outputs/bundle/release/app-release.aab'))
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--require-signed', action='store_true')
    args = parser.parse_args()
    manifests = [args.manifest] if args.manifest else list(Path('android/app/build/intermediates/merged_manifests/release').glob('**/AndroidManifest.xml'))
    if len(manifests) != 1:
        parser.error('Expected exactly one merged release manifest; supply --manifest if needed')
    try:
        print(json.dumps(verify(args.bundle, manifests[0], args.require_signed), indent=2))
    except (AssertionError, KeyError, ValueError, OSError) as error:
        raise SystemExit(f'Android artifact rejected: {error}') from error
