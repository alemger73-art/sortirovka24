import PartnerAdminShell from '@/components/partner/PartnerAdminShell';
import AdminPharmacy from './AdminPharmacy';

export default function PartnerPharmacyAdmin() {
  return (
    <PartnerAdminShell partnerType="pharmacy">
      <AdminPharmacy partnerMode />
    </PartnerAdminShell>
  );
}
