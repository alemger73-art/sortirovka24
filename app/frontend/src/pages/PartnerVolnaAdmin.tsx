import PartnerAdminShell from '@/components/partner/PartnerAdminShell';
import AdminVolna from './AdminVolna';

export default function PartnerVolnaAdmin() {
  return (
    <PartnerAdminShell partnerType="volna">
      <AdminVolna partnerMode />
    </PartnerAdminShell>
  );
}
