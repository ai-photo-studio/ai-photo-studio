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
"use strict";class MagicScanDropHook{constructor(){this._pendingFile=null,this._origItems=Object.getOwnPropertyDescriptor(DataTransfer.prototype,"items"),this._origTypes=Object.getOwnPropertyDescriptor(DataTransfer.prototype,"types")}install(){this._installOverrides(),document.addEventListener("__magicScan:prepare",()=>this._onPrepare()),document.addEventListener("drop",()=>this._onDrop(),!1)}_installOverrides(){const e=this;Object.defineProperty(DataTransfer.prototype,"types",{get(){return e._pendingFile?["Files"]:e._origTypes.get.call(this)},configurable:!0}),Object.defineProperty(DataTransfer.prototype,"items",{get(){return e._pendingFile?e._buildItemList(e._pendingFile):e._origItems.get.call(this)},configurable:!0})}_onPrepare(){const e=sessionStorage.getItem("__magicScan_file");if(e){sessionStorage.removeItem("__magicScan_file");try{const{dataUrl:t,name:i,type:r}=JSON.parse(e),n=Uint8Array.from(atob(t.split(",")[1]),e=>e.charCodeAt(0));this._pendingFile=new File([n],i,{type:r})}catch(e){console.error("[MagicScan] prepare error:",e)}}else console.warn("[MagicScan] no file in sessionStorage")}_onDrop(){this._pendingFile&&setTimeout(()=>{this._pendingFile=null},100)}_buildItemList(e){const t=this._buildFileEntry(e),i={kind:"file",type:e.type,getAsFile:()=>e,getAsString:()=>{},webkitGetAsEntry:()=>t};return{0:i,length:1,[Symbol.iterator](){let e=!1;return{next:()=>e?{done:!0}:(e=!0,{value:i,done:!1})}}}}_buildFileEntry(e){return{isFile:!0,isDirectory:!1,name:e.name,fullPath:"/"+e.name,filesystem:null,file(t,i){try{t(e)}catch(e){i?.(e)}},createReader:()=>({readEntries:e=>e([])})}}}window.__magicScanHookInstalled||(window.__magicScanHookInstalled=!0,(new MagicScanDropHook).install());