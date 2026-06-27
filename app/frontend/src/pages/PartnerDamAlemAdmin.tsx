import PartnerAdminShell from '@/components/partner/PartnerAdminShell';
import AdminDamAlem from './AdminDamAlem';

export default function PartnerDamAlemAdmin() {
  return (
    <PartnerAdminShell partnerType="dam_alem">
      <AdminDamAlem partnerMode />
    </PartnerAdminShell>
  );
}
