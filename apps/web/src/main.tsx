import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import "./styles.css";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (command: string, ...args: unknown[]) => void;
  }
}

const meta = {
  title: "AI Product Photo Studio | Ecommerce Background Removal & AI Photo Editing",
  description: "Professional AI product photo editing for ecommerce sellers. Background removal, auto crop, flat lay, lifestyle scenes, virtual models, and more.",
  image: "https://aistudio.example.com/og-image.png",
  url: "https://aistudio.example.com"
};

const updateMeta = () => {
  document.title = meta.title;
  
  let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
  if (!metaDescription) {
    metaDescription = document.createElement("meta");
    metaDescription.name = "description";
    document.head.appendChild(metaDescription);
  }
  metaDescription.content = meta.description;
  
  let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
  if (!ogTitle) {
    ogTitle = document.createElement("meta");
    ogTitle.setAttribute("property", "og:title");
    document.head.appendChild(ogTitle);
  }
  ogTitle.content = meta.title;
  
  let ogDescription = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
  if (!ogDescription) {
    ogDescription = document.createElement("meta");
    ogDescription.setAttribute("property", "og:description");
    document.head.appendChild(ogDescription);
  }
  ogDescription.content = meta.description;
  
  let ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
  if (!ogImage) {
    ogImage = document.createElement("meta");
    ogImage.setAttribute("property", "og:image");
    document.head.appendChild(ogImage);
  }
  ogImage.content = meta.image;
  
  let ogUrl = document.querySelector('meta[property="og:url"]') as HTMLLinkElement;
  if (!ogUrl) {
    ogUrl = document.createElement("link");
    ogUrl.setAttribute("rel", "canonical");
    document.head.appendChild(ogUrl);
  }
  ogUrl.href = meta.url;
  
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.href = meta.url;
};

updateMeta();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if (typeof window !== "undefined") {
  window.dataLayer = window.dataLayer || [];
  function gtag(){(window.dataLayer as unknown[]).push(arguments);}
  if (window.gtag) {
    window.gtag('js', new Date());
    window.gtag('config', 'GA_MEASUREMENT_ID');
  }
  
  const fbPixel = document.createElement("script");
  fbPixel.innerHTML = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', 'YOUR_PIXEL_ID');
    fbq('track', 'PageView');
  `;
  document.head.appendChild(fbPixel);
  
  const noscript = document.createElement("noscript");
  noscript.innerHTML = '<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"/>';
  document.head.appendChild(noscript);
}