package kz.sortirovka24.app;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReceiptPrinter")
public class ReceiptPrinterPlugin extends Plugin {
    private WebView document;
    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html", "");
        String title = call.getString("title", "Receipt");
        if (html.isEmpty() || html.length() > 1000000) { call.reject("Invalid receipt"); return; }
        getActivity().runOnUiThread(() -> {
            if (document != null) { call.reject("Printing is already open"); return; }
            PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            if (manager == null) { call.reject("Print service unavailable"); return; }
            document = new WebView(getActivity());
            document.getSettings().setJavaScriptEnabled(false);
            document.getSettings().setAllowFileAccess(false);
            document.setWebViewClient(new WebViewClient() {
                private boolean started = false;
                @Override public void onPageFinished(WebView view, String url) {
                    if (started) return;
                    started = true;
                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                    manager.print(title, new PrintDocumentAdapter() {
                        @Override public void onStart() { adapter.onStart(); }
                        @Override public void onLayout(PrintAttributes oldAttrs, PrintAttributes newAttrs, CancellationSignal signal, LayoutResultCallback callback, Bundle extras) { adapter.onLayout(oldAttrs, newAttrs, signal, callback, extras); }
                        @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal signal, WriteResultCallback callback) { adapter.onWrite(pages, destination, signal, callback); }
                        @Override public void onFinish() { adapter.onFinish(); if (document != null) { document.destroy(); document = null; } }
                    }, new PrintAttributes.Builder().build());
                    call.resolve();
                }
            });
            document.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
