import {useState} from 'react';
import {Printer} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/contexts/LanguageContext';
import {printOrder,type PrintableOrder} from '@/lib/receiptPrint';
import {toast} from 'sonner';
export default function PrintReceiptButton({order}: {order: PrintableOrder}) {
  const {t}=useLanguage();const [busy,setBusy]=useState(false);
  return <Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await printOrder(order);}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}><Printer className="h-4 w-4 mr-2" />{t('workflow.print')}</Button>;
}
