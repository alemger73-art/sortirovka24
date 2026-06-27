import PartnerAdminShell from '@/components/partner/PartnerAdminShell';
import AdminGastronom from './AdminGastronom';

export default function PartnerGastronomAdmin() {
  return (
    <PartnerAdminShell partnerType="gastronom">
      <AdminGastronom partnerMode />
    </PartnerAdminShell>
  );
}
