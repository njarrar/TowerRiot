package com.njarrar.towerriot;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private float lastTop = 0f, lastRight = 0f, lastBottom = 0f, lastLeft = 0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
        }

        View root = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            if (density <= 0f) density = 1f;
            lastTop = bars.top / density;
            lastRight = bars.right / density;
            lastBottom = bars.bottom / density;
            lastLeft = bars.left / density;
            pushSafeAreaInsets();
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    @Override
    public void onResume() {
        super.onResume();
        pushSafeAreaInsets();
    }

    private void pushSafeAreaInsets() {
        if (getBridge() == null) return;
        WebView wv = getBridge().getWebView();
        if (wv == null) return;
        final String js = String.format(
            java.util.Locale.US,
            "(function(){var s=document.documentElement.style;" +
            "s.setProperty('--safe-t','%.2fpx');" +
            "s.setProperty('--safe-r','%.2fpx');" +
            "s.setProperty('--safe-b','%.2fpx');" +
            "s.setProperty('--safe-l','%.2fpx');" +
            "window.dispatchEvent(new Event('resize'));})();",
            lastTop, lastRight, lastBottom, lastLeft
        );
        wv.post(() -> wv.evaluateJavascript(js, null));
    }
}
