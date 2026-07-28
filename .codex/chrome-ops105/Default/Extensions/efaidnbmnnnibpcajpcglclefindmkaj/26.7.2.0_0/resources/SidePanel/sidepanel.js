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
import{dcLocalStorage as e}from"../../common/local-storage.js";import{SIDE_PANEL_HASH_ROUTES as t}from"../../common/constant.js";import{util as o}from"../../browser/js/content-util.js";import{checkCdnConnectivity as n}from"../../common/util.js";import{connectSidePanelPort as r,createSendAnalytics as a,getSidePanelTabId as m,isHomeShellRoute as i}from"./sidePanelUtil.js";import{fetchAndSendHtmlContent as s}from"./htmlContentFetcher.js";import{getGenAiPrerenderState as d,shouldShowTrefoilLoader as l,showTrefoilLoader as c}from"./loaderUIHelper.js";import{Cdn as p}from"./cdn.js";import{initHomeMode as f}from"./home.js";import{initOfflineMode as I}from"./offline.js";import{registerHostedShellListeners as h}from"./shell-listeners.js";const E=Date.now();await e.init();const u=e.getItem("isSidePanelHomeEnabled");let S=e.getItem("touchpoint");e.removeItem("touchpoint");let w=e.getItem("hashRoute");e.removeItem("hashRoute"),S||(S="ExtensionAction",w=t.HOME),u||(w=t.SIDE_PANEL);const j=i(w),b=document.getElementById("tooltipTextEnabled");u&&j&&b&&(b.id="tooltipTextEnabledHome"),o.translateElementsByAppLocale(".translate");const A=await d(w,S);l(A)&&c(),A?.showPreRendered&&(e=>{const t=document.createElement("iframe");t.id="sidepanelPreRendered",t.title="Adobe Chatbot",t.srcdoc=e,document.body.appendChild(t)})(A.anonGenAISSRHtml);const P=e.getItem("sidepanelUrl");if(P){await n(P)?j?await f(E,w,S):await async function(e,o,n){const r=m(),i=a(r);i(`DCBrowserExt:SidePanel:Opened:${o||"Unspecified"}`);const d=new p({initTimeStamp:e,hostedHashRoute:t.SIDE_PANEL,touchpoint:o,anonGenAISSRHtml:n?.anonGenAISSRHtml,onIframeLoad:()=>i(`DCBrowserExt:SidePanel:IframeLoaded:${o}`),onIframeError:()=>i(`DCBrowserExt:SidePanel:IframeLoadError:${o}`)});h({cdn:d,sendAnalytics:i,tabId:r,touchpoint:o}),await s({cdn:d,tabId:d.tabId,touchpoint:o})}(E,S,A):I(E)}else{const e=m();r(e,E),chrome.runtime.sendMessage({type:"sidepanel_close_reason",tabId:e,reason:"NoSidepanelUrl"})}