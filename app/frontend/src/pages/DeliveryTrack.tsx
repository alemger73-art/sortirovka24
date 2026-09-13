import { Navigate, useParams } from 'react-router-dom';
export default function DeliveryTrack() {
  const {orderId} = useParams();
  return <Navigate replace to={`/cabinet/orders/food/${orderId}`} />;
}
