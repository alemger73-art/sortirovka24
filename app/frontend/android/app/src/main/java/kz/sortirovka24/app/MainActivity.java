package kz.sortirovka24.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ReceiptPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
