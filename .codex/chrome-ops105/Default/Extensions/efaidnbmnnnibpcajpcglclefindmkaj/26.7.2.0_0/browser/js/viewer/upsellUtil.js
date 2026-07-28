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
import{dcLocalStorage as e}from"../../../common/local-storage.js";import{getFloodgateFlag as t}from"../../../common/util.js";import{loggingApi as n}from"../../../common/loggingApi.js";import{CACHE_PURGE_SCHEME as o}from"../../../sw_modules/constant.js";const i="dc-cv-upsell-popup-metadata",r=85,s=95;export async function getUpsellPopupDimensions(){const e={widthPercent:r,heightPercent:s};try{if(!await t(i,o.NO_CALL))return e;const n=await chrome.runtime.sendMessage({main_op:"getFloodgateMeta",flag:i});if(!n)return e;const r=JSON.parse(n);return{widthPercent:r.widthPercent??e.widthPercent,heightPercent:r.heightPercent??e.heightPercent}}catch(t){return e}}export async function openUpsellPopupWindow(t,o,i){const{widthPercent:r,heightPercent:s}=await getUpsellPopupDimensions(),c=Math.round(window.outerWidth*(r/100)),d=Math.round(window.innerHeight*(s/100)),p=window.outerHeight-window.innerHeight,w=Math.round(window.screenX+(window.outerWidth-c)/2),a=Math.round(window.screenY+p+(window.innerHeight-d)/2);chrome.windows.create({url:t,type:"popup",width:c,height:d,left:w,top:a},t=>{if(null==t?.id)return void n.error({message:"[Paywall] Popup window creation failed — chrome.windows.create returned no id"});const r=e.getItem("upsellSessions")||{};r[o]={...r[o],popupWindow:t},e.setItem("upsellSessions",r),i&&i(t)})}