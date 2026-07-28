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
import e from"../CacheStore.js";import{common as n}from"../common.js";import{forceResetService as t}from"../force-reset-service.js";import{CONTENT_SIGNAL_RULES_CACHE_KEY as i,CONTENT_SIGNAL_RULES_OTE_FEATURE as r}from"./constants.js";import{getStudentDetectionConfig as o,applyFloodgateClassificationRules as s}from"./StudentDetectionConfig.js";import{CONTENT_SIGNAL_RULES_ENCODING as a,decodeContentSignalRulesEntries as c}from"../../common/domain-encoding.js";export class QualifyingListLoader{constructor(n=new e(r)){this.cacheStore=n}static parseConfig(e){if(!e?.entries||!Array.isArray(e.entries)||0===e.entries.length)return null;const n=e.encoding===a?c(e.entries):e.entries;return{version:e.version||"1.0.0",rules:{uniqueDomainThreshold:e.rules?.uniqueDomainThreshold,activeDayThreshold:e.rules?.activeDayThreshold,engagementSpanDays:e.rules?.engagementSpanDays,windowDays:e.rules?.windowDays},entries:n}}static async finalizeConfig(e){if(!e)return null;const n=await o();return{...e,rules:s(e.rules,n)}}static async fetchFromUrl(e){const n=await fetch(e);if(!n.ok)return null;const t=await n.json();return QualifyingListLoader.finalizeConfig(QualifyingListLoader.parseConfig(t))}async load(){const e=n.getContentSignalRulesUri();if(!e)return null;const o=async()=>{const n=await fetch(e);if(!n.ok)return null;const t=await n.json(),r=QualifyingListLoader.parseConfig(t);return r&&await this.cacheStore.set(i,r),QualifyingListLoader.finalizeConfig(r)};try{const{executionResult:e}=await t.executeFeature(r,o);if(e)return e}catch{}const s=await this.cacheStore.get(i);return s?QualifyingListLoader.finalizeConfig(QualifyingListLoader.parseConfig(s)):o()}}