import { getAPIBaseURL } from './config';
import { getAccountToken } from './accountApi';
import { foodOperations } from './foodOperations';
export type LoyaltyRules = {auto_enroll:boolean;cashback_rate:number; max_spend_percent:number; welcome_amount:number; welcome_days:number; regular_days:number; referral_amount:number; referral_enabled:boolean; earning_enabled:boolean; spending_enabled:boolean; referral_daily_limit:number; customer_daily_order_limit:number; version?:number};
export type LoyaltyHistory = {id:number; kind:string; amount:number; reason:string; order_id?:number; created_at:string; expires_at?:string; balance_after?:number};
export type MyLoyalty = {business_id:string;customer_id:string;enrolled:boolean;balance:number; debt:number; rules:LoyaltyRules; referral_code:string; expires:{amount:number;at:string}[]; history:LoyaltyHistory[]};
export const bonusNumber = (value:unknown) => Number(value || 0).toLocaleString('ru-RU', {maximumFractionDigits:2});
export const bonusKinds:Record<string,string> = {EARN:'За заказ',SPEND:'Списание',REVERSAL:'Возврат / отмена начисления',EXPIRE:'Истекли',WELCOME:'Первый заказ',REFERRAL:'Приглашение',MANUAL_ADJUSTMENT:'Корректировка',LEGACY:'Прежняя операция',LEGACY_OPENING:'Перенос остатка'};
export async function clientLoyalty<T>(path:string, body?:unknown):Promise<T> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/dam-alem/loyalty${path}`, {method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${getAccountToken()}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json(); if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не удалось выполнить операцию'); return data;
}
export const ownerLoyalty = <T,>(path:string, method='GET', body?:unknown) => foodOperations<T>('/owner'+path,method,body,'loyalty');
