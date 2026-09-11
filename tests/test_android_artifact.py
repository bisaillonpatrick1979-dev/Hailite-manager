import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('artifact', Path(__file__).resolve().parents[1] / 'scripts/verify-android-artifact.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.bundle = Path(self.temp.name) / 'app.aab'
        self.manifest = Path(self.temp.name) / 'AndroidManifest.xml'
        self.manifest.write_text('''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="ca.hailite.manager" android:versionCode="2">
        <uses-sdk android:targetSdkVersion="36"/><application android:allowBackup="false" android:usesCleartextTraffic="false"/></manifest>''')

    def build(self, native=False, trial=False):
        with ZipFile(self.bundle, 'w') as archive:
            archive.writestr('base/assets/public/index.html', '<html></html>')
            archive.writestr('base/assets/public/build-provenance.json', json.dumps({'mode': 'mobile', 'trial': trial}))
            archive.writestr('base/assets/capacitor.config.json', '{}')
            if native:
                archive.writestr('base/lib/arm64-v8a/lib-dependency.so', b'ELF')

    def test_unsigned_is_only_allowed_for_build_verification(self):
        self.build()
        self.assertFalse(module.verify(self.bundle, self.manifest)['signaturePresent'])
        with self.assertRaisesRegex(AssertionError, 'Unsigned AAB'):
            module.verify(self.bundle, self.manifest, require_signed=True)

    def test_dependency_native_binary_cannot_bypass_source_scan(self):
        self.build(native=True)
        with self.assertRaisesRegex(AssertionError, '16 KB'):
            module.verify(self.bundle, self.manifest)

    def test_trial_build_cannot_be_sold(self):
        self.build(trial=True)
        with self.assertRaisesRegex(AssertionError, 'trial expiration'):
            module.verify(self.bundle, self.manifest)

    def test_merged_dependency_permission_is_rejected(self):
        self.build()
        self.manifest.write_text(self.manifest.read_text().replace('</manifest>', '<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/></manifest>'))
        with self.assertRaisesRegex(AssertionError, 'sensitive permission'):
            module.verify(self.bundle, self.manifest)


if __name__ == '__main__':
    unittest.main()
