import PartnerAdminShell from '@/components/partner/PartnerAdminShell';
import AdminProrab from './AdminProrab';

export default function PartnerProrabAdmin() {
  return (
    <PartnerAdminShell partnerType="prorab">
      <AdminProrab partnerMode />
    </PartnerAdminShell>
  );
}
