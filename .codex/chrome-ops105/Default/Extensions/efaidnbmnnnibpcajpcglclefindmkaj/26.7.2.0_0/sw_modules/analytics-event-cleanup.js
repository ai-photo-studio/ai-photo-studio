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
import{dcLocalStorage as e}from"../common/local-storage.js";import{removeExperimentCodeForAnalytics as r}from"../common/experimentUtils.js";import{floodgate as t}from"./floodgate.js";import{cleanupOldPdfRenderingTrackingStorage as C}from"../common/pdf-rendering-tracking.js";const i=["DCBrowserExt:OneNote:Visited","DCBrowserExt:DocsGoogle:Visited:Document","DCBrowserExt:DocsGoogle:Visited:Spreadsheet","DCBrowserExt:DocsGoogle:Visited:Presentation","DCBrowserExt:Gdrive:Image:Opened","DCBrowserExt:Gmail:Image","DCBrowserExt:Gmail:ImageAttachment:Opened","gmail-pdf-default-viewership-session-count","gdrive-pdf-default-viewership-session-count","DCBrowserExt:ChatGPT:DownloadAsPdf:Clicked","DCBrowserExt:GDrive:TripleDotMenuClicked","DCBrowserExt:GDrive:TopFileBarMenuClicked:SingleSelect","DCBrowserExt:GDrive:TopFileBarMenuClicked:MultiSelect","DCBrowserExt:GDrive:RightClickMenuClicked:SingleSelect","DCBrowserExt:GDrive:RightClickMenuClicked:MultiSelect","AiMarkerRanking","AiMarkerVariant","aiMarkers"],o=["GDCT","GDCC","GDIF","GDTT","GDTF","GDCF","OT","OTC","EMP","LI","LIC","LC","LCC","LFP","LFF","LFC","GIT","GIC","GIDN","GDIN","GDIT","GDIC","GSH","GSHC","GST","GSC","GCO","GCOC","CRT","CRI","CRC","CCT","CCTC","CDR","CDRC","GMPC","GMP1","GMP2","GCI","GCIC","GCIW","GCIWC","GCEP","GCEPC","GEP","GEPC","GMC","GMCC","GCP","GCPC"],s=async()=>{((e=[])=>{Array.isArray(e)&&0!==e.length&&e.forEach(e=>{r(e)})})(o),(async()=>{try{const r=e.getAllItems(),C=[];Object.keys(r).forEach(r=>{const i=r.match(/^DCBrowserExt:([^:]+):Visited$/);if(i&&i.length>1){const o=`dc-cv-${i[1].toLowerCase()}-analytics-visited`;C.push((async()=>{await t.hasFlag(o)||await e.removeItem(r)})())}}),await Promise.all(C)}catch(e){}})(),C(),((r=[])=>{Array.isArray(r)&&0!==r.length&&r.forEach(r=>{e.getItem(r)&&e.removeItem(r)})})(i)};export{s as clearEventsFromLocalStorage};