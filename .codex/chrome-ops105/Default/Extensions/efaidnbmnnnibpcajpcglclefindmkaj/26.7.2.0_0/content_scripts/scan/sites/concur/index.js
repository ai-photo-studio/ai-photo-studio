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
"use strict";class ConcurSite{config={disabled:!1,selector:"[data-nuiexp='drag-drop-file']",guardSelector:"[data-nuiexp='add-modal']",buttonsSelector:".spend-common__drag-n-drop__buttons",containerStyle:"display:flex; justify-content:center; margin-top:16px;",themeStyles:{btn:"background: transparent;",wrapper:"",hover:""}};constructor(){this.INJECTED_ATTR=magicScanCore.INJECTED_ATTR,this.inputButtonMap=new Map,this.domObserver=null}async run(){await magicScanCore.init()&&(this.config={...this.config,...magicScanCore.siteConfig??{}},this.config.disabled||(this.domObserver=magicScanCore.observeDOM(()=>this.scanAndInject()),this.scanAndInject()))}scanAndInject(){if(this.inputButtonMap.forEach((t,e)=>{e.isConnected||(t.remove(),this.inputButtonMap.delete(e))}),!document.querySelector(this.config.guardSelector))return;const t=document.querySelector(this.config.selector);t&&this.injectButton(t)}injectButton(t){if(this.inputButtonMap.has(t))return;const e=t.getBoundingClientRect();if(0===e.width&&0===e.height)return;const n=t.querySelector(this.config.buttonsSelector)??t,i=document.createElement("span");i.style.cssText=this.config.containerStyle,n.insertAdjacentElement("afterend",i),magicScanCore.renderButton(i,{isDarkMode:!1,themeStyles:this.config.themeStyles,selector:this.config.selector,inputButtonMap:this.inputButtonMap,onFileClear:()=>{t.removeAttribute(this.INJECTED_ATTR)},onHide:()=>this.cleanup()}),this.inputButtonMap.set(t,i),t.setAttribute(this.INJECTED_ATTR,"true")}cleanup(){this.domObserver?.disconnect(),this.removeAllButtons()}removeAllButtons(){this.inputButtonMap.forEach((t,e)=>{e.removeAttribute(this.INJECTED_ATTR),t.remove()}),this.inputButtonMap.clear()}}const concurSite=new ConcurSite;concurSite.run();