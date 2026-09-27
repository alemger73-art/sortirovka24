import {useRef, useState} from 'react';
import {Printer} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/contexts/LanguageContext';
import {printOrder,type PrintableOrder} from '@/lib/receiptPrint';
import {toast} from 'sonner';
export default function PrintReceiptButton({order, loadOrder}: {order?: PrintableOrder; loadOrder?: () => Promise<PrintableOrder>}) {
  const {t}=useLanguage();const [busy,setBusy]=useState(false);const lock=useRef(false);
  return <Button variant="outline" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{const current = loadOrder ? await loadOrder() : order; if(!current)throw new Error('Нет данных чека');await printOrder(current);}catch(e){toast.error((e as Error).message);}finally{lock.current=false;setBusy(false);}}}><Printer className="h-4 w-4 mr-2" />{t('workflow.print')}</Button>;
}
