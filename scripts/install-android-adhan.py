"""Install the tracked native adhan implementation into Capacitor's generated app."""
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
android = root / 'android/app/src/main'
package = android / 'java/com/nadern922/salati'
package.mkdir(parents=True, exist_ok=True)
for source in (root / 'native/android').glob('*.java'):
    shutil.copyfile(source, package / source.name)

activity = package / 'MainActivity.java'
activity.write_text('''package com.nadern922.salati;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdhanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
''')

ns = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ns)
a = lambda key: '{' + ns + '}' + key
manifest = android / 'AndroidManifest.xml'
tree = ET.parse(manifest)
xml = tree.getroot()
for permission in ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'RECEIVE_BOOT_COMPLETED',
                   'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'WAKE_LOCK']:
    name = 'android.permission.' + permission
    if not any(node.get(a('name')) == name for node in xml.findall('uses-permission')):
        ET.SubElement(xml, 'uses-permission', {a('name'): name})
app = xml.find('application')
for tag, name in [('receiver', '.AdhanReceiver'), ('service', '.AdhanService')]:
    for old in app.findall(tag):
        if old.get(a('name')) == name:
            app.remove(old)
receiver = ET.SubElement(app, 'receiver', {a('name'): '.AdhanReceiver', a('exported'): 'false'})
filters = ET.SubElement(receiver, 'intent-filter')
for action in ['android.intent.action.BOOT_COMPLETED', 'android.intent.action.MY_PACKAGE_REPLACED',
               'android.intent.action.TIME_SET', 'android.intent.action.TIMEZONE_CHANGED',
               'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED']:
    ET.SubElement(filters, 'action', {a('name'): action})
ET.SubElement(app, 'service', {a('name'): '.AdhanService', a('exported'): 'false',
                             a('foregroundServiceType'): 'mediaPlayback'})
ET.indent(tree, space='    ')
tree.write(manifest, encoding='utf-8', xml_declaration=True)

gradle = root / 'android/app/build.gradle'
s = gradle.read_text()
dependency = "implementation 'androidx.work:work-runtime:2.10.1'"
if dependency not in s:
    s += '\n' + 'dependencies { ' + dependency + ' }\n'
gradle.write_text(s)
