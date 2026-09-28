import {getAPIBaseURL} from './config';
import {getAccountToken} from './accountApi';
import {foodOperations} from './foodOperations';
import type {MyLoyalty} from './loyalty';
export type CRMContact={id:string;name:string;phone:string};
export type CRMOrder={id:number;status:string;total_amount:number;paid_amount:number;payment_status:string;delivery_method:string;scheduled_for?:string;created_at?:string;comment?:string;order_source:string};
export type CRMProfile=CRMContact&{business_id:string;marketing_opt_in:boolean;orders_count:number;paid_total:number;average_check:number;addresses:string[];last_order?:string;last_fulfillment?:string;upcoming:CRMOrder[];recent:CRMOrder[];loyalty:MyLoyalty;notes?:{id:number;text:string;author:string;created_at:string}[]};
export const crmStaff=<T,>(path:string,method='GET',body?:unknown)=>foodOperations<T>(path,method,body,'crm');
export async function crmClient<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch(`${getAPIBaseURL()}/api/v1/crm/me${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${getAccountToken()}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json();if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не удалось получить данные клиента');return data;
}
