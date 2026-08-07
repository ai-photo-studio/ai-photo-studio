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
  title: "ThanNow | Restore, Upscale and Print Memories",
  description: "ThanNow AI photo restoration, upscaling and premium printing for the people and moments that matter most.",
  image: "https://www.thannow.com/assets/hero-compare.png",
  url: "https://www.thannow.com"
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
  // Analytics only load when real IDs are configured via build-time env; the
  // placeholder IDs/URLs must not ship to production (R9.3 launch prep).
  const gtmId = import.meta.env.VITE_GTM_MEASUREMENT_ID;
  const fbPixelId = import.meta.env.VITE_FACEBOOK_PIXEL_ID;

  if (gtmId) {
    window.dataLayer = window.dataLayer || [];
    function _gtag(...args: unknown[]){(window.dataLayer as unknown[]).push(args);}
    if (window.gtag) {
      window.gtag('js', new Date());
      window.gtag('config', gtmId);
    }
  }

  if (fbPixelId) {
    const fbPixel = document.createElement("script");
    fbPixel.innerHTML = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', ${JSON.stringify(fbPixelId)});
      fbq('track', 'PageView');
    `;
    document.head.appendChild(fbPixel);

    const noscript = document.createElement("noscript");
    noscript.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${encodeURIComponent(fbPixelId)}&ev=PageView&noscript=1"/>`;
    document.head.appendChild(noscript);
  }
}