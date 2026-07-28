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
export const CONTENT_SIGNAL_RULES_ENCODING="obfuscated";let n=null,t=null,e=null,r=null;function o(n,t){const e={};for(let r=0;r<n.length;r+=1)e[n[r]]=t[r];return e}function u(n){const t={};return Object.entries(n).forEach(([n,e])=>{t[e]=n}),t}function c(){return n||(n=o("abcdefghijklmnopqrstuvwxyz0123456789.-","tubg6lxdq8jc1m9-vw.pfhskar0oi5zn372ye4")),n}function i(){return t||(t=u(c())),t}function l(){return r||(r=u((e||(e=o("abcdefghijklmnopqrstuvwxyz0123456789.-^{}()|?[]*$#<>_/\\","k3_v[8b(j1y\\4^q0cd.gu9t>eaw6sn/rp{2i7m#z5|hfxol*?]$)-}<")),e))),r}function a(n,t){return n.toLowerCase().split("").map(n=>t[n]||n).join("")}export function encodeDomain(n){return a(n,c())}export function decodeDomain(n){return a(n,i())}export function decodeContentSignalEntryValue(n,t){return n&&"string"==typeof n?a(n,"regex"===t?l():i()):n}export function decodeContentSignalRulesEntries(n){return Array.isArray(n)?n.map(n=>({...n,value:decodeContentSignalEntryValue(n.value,n.matchType)})):[]}