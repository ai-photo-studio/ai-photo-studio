/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
*  Copyright 2015 Adobe Systems Incorporated
*  All Rights Reserved.
*
* NOTICE:  All information contained herein is, and remains
* the property of Adobe Systems Incorporated and its suppliers,
* if any.  The intellectual and technical concepts contained
* herein are proprietary to Adobe Systems Incorporated and its
* suppliers and are protected by all applicable intellectual property laws,
* including trade secret and or copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe Systems Incorporated.
**************************************************************************/
export const SESSION_TYPES={HTML_TO_PDF:"html-to-pdf",OUTLOOK_PDF:"outlook-pdf",UPSELL:"upsell"};const t={[SESSION_TYPES.OUTLOOK_PDF]:{domains:["https://outlook.office365.com","https://outlook.office.com","https://outlook.live.com","https://outlook.cloud.microsoft"],ttlMs:3e5},[SESSION_TYPES.HTML_TO_PDF]:{ttlMs:18e5,defaultData:{sourceTabUrl:null,frameId:null,targetSectionId:null}},[SESSION_TYPES.UPSELL]:{ttlMs:18e5,idFormat:"numeric"}},e=new Map;function o(){const t=Date.now();e.forEach((o,n)=>{t-o.createdAt>o.ttlMs&&e.delete(n)})}export function createSession({type:t,data:n,tabId:s,ttlMs:r=18e5,useOnce:l=!1,idFormat:u}={}){if(!t||"object"!=typeof n||null===n)return null;if(o(),e.size>=200){const t=e.keys().next().value;void 0!==t&&e.delete(t)}const a=function(t){return"numeric"===t?`${Date.now()}${String(Math.floor(1e3*Math.random())).padStart(3,"0")}`:crypto.randomUUID()}(u);return e.set(a,{type:t,data:{...n,...Number.isInteger(s)?{sourceTabId:s}:null},tabId:Number.isInteger(s)?s:null,createdAt:Date.now(),ttlMs:r,useOnce:l}),a}export function getSession(t,n){if(!t||!n)return null;o();const s=String(n),r=e.get(s);return r&&r.type===t?(r.useOnce&&e.delete(s),r.data):null}export function deleteSessionsForTab(t){Number.isInteger(t)&&e.forEach((o,n)=>{o.tabId===t&&e.delete(n)})}export function createSessionFromMessage(e,o){const n=t[e?.type];if(!n)return null;const s=n.domains;if(s){const t=o?.url?new URL(o.url).origin:null;if(!t||!s.includes(t))return null}const r={...n.defaultData||{},...e.data};return createSession({type:e.type,data:r,tabId:o?.id,ttlMs:n.ttlMs,useOnce:n.useOnce,idFormat:n.idFormat})}export function getSessionFromMessage(e){return Object.hasOwn(t,e?.type)?getSession(e.type,e.sessionId):null}