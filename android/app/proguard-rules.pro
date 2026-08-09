# ---------------------------------------------------------------------------
# Règles R8 / ProGuard — build de release
# ---------------------------------------------------------------------------
# Le build de release active minifyEnabled et shrinkResources (voir
# build.gradle). R8 supprime alors tout code qu'il croit inutilisé.
#
# Le problème : Capacitor ne référence PAS ses plugins directement. Il les
# retrouve à l'exécution, par annotation et par nom de classe, depuis le pont
# JavaScript. R8 ne voit donc aucun appel vers eux et peut les effacer. Le
# symptôme est déroutant : l'APK de débogage (non minifié) fonctionne, et
# c'est uniquement la version publiée sur la boutique qui perd le GPS ou
# l'écran de démarrage.
#
# Ces règles conservent le pont, les plugins et tout ce qui est atteint par
# réflexion. Elles ne coûtent que quelques kilooctets.

# --- Pont Capacitor et plugins ---------------------------------------------
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}

# --- Plugins officiels utilisés par l'application --------------------------
# Géolocalisation (géorepérage du pointage) et écran de démarrage.
-keep class com.capacitorjs.plugins.** { *; }

# --- Plugins Cordova éventuellement embarqués par Capacitor ----------------
-keep class org.apache.cordova.** { *; }

# --- Classes de l'application ----------------------------------------------
-keep class ca.hailite.manager.** { *; }

# --- Réflexion et interface JavaScript -------------------------------------
# @JavascriptInterface est le point d'entrée du WebView vers le code natif :
# renommer ces méthodes rompt silencieusement toute communication.
-keepattributes *Annotation*, JavascriptInterface, Signature, InnerClasses, EnclosingMethod
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Confort de diagnostic --------------------------------------------------
# Conserve les numéros de ligne pour que les rapports de plantage de Play
# Console restent lisibles, sans révéler les noms de fichiers d'origine.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
