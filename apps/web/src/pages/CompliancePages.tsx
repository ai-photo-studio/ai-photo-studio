import { useEffect } from "react";

const LAST_UPDATED = "12 August 2026";

function CompliancePage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} | ThanNow`;
    let descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!descriptionTag) {
      descriptionTag = document.createElement("meta");
      descriptionTag.name = "description";
      document.head.appendChild(descriptionTag);
    }
    descriptionTag.content = description;
  }, [title, description]);

  return (
    <section className="page-stack compliance-page">
      <div className="section-heading">
        <p className="eyebrow">ThanNow</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <p className="helper-text">Last updated: {LAST_UPDATED}</p>
      </div>
      <div className="compliance-content">{children}</div>
    </section>
  );
}

function Sections({ sections }: { sections: Array<{ title: string; text?: string; items?: string[] }> }) {
  return <>{sections.map((section) => <section className="compliance-section" key={section.title}><h2>{section.title}</h2>{section.text && <p>{section.text}</p>}{section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}</>;
}

export function FaqPage() {
  return <CompliancePage title="Frequently asked questions" description="Clear answers about restoration, digital products, printing, payment, privacy, and support.">
    <Sections sections={[
      { title: "Restoration", items: [
        "ThanNow restores damaged photographs by reducing scratches, fading, noise, and other visible damage while improving clarity.",
        "ThanNow is designed to restore damage, improve clarity, and enhance image quality while preserving the person's original identity and facial characteristics. AI-based restoration may involve minor reconstruction where image information is missing.",
        "Old, scratched, faded, torn, or damaged photographs can be submitted if the important image areas are reasonably visible.",
        "Upload a supported image file such as JPG, JPEG, PNG, or WebP. Use the highest-quality original available and avoid screenshots or heavily compressed copies.",
        "Processing time depends on image size, selected service, and queue conditions. The order status page shows the current state; ThanNow does not promise a fixed processing time."
      ]},
      { title: "Digital products", items: [
        "Customers can purchase a restored digital image without ordering a physical print where that option is shown.",
        "After successful payment and processing, the completed file is made available through the order journey and its download link.",
        "Available resolution and quality options are shown in the current PKR catalog. A restored image can be used for printing, subject to the selected resolution and print suitability."
      ]},
      { title: "Upscaling", items: [
        "Upscaling increases image dimensions and uses image processing to improve detail for larger uses.",
        "Select the quality that matches the intended print or display size. Higher options may be more suitable for larger prints.",
        "Upscaling is designed to preserve the original identity, but AI processing can reconstruct missing information and is not an exact record of unseen detail."
      ]},
      { title: "Printing", items: [
        "Printed photographs are available only where the current print catalog and checkout show them as available.",
        "Canvas and framed products are available only where specifically offered in the current catalog; ThanNow does not promise an unavailable format.",
        "Available sizes, quantities, delivery charges, and the digital/physical distinction are shown before payment. Physical orders are delivered using the fulfilment arrangements available for the order."
      ]},
      { title: "Payment", items: [
        "Pakistan customer prices and the local checkout total are displayed in PKR.",
        "Payment methods are limited to those shown at checkout. Bank Alfalah APG may be used as the authorized processing channel.",
        "A failed or cancelled payment is not treated as a successfully paid order. Report a possible duplicate charge to support for investigation."
      ]},
      { title: "Refunds", items: [
        "A digital order may be cancellable before processing starts, depending on its status.",
        "A completed customized digital product normally cannot be returned like a physical product, but genuine technical failures are investigated.",
        "Wrong or damaged prints, incorrect sizes, significant defects, and verified processing errors can be reported for correction, replacement, or refund review. Contact ThanNow promptly with evidence."
      ]},
      { title: "Privacy", items: [
        "Uploaded photographs are processed to provide the selected service and are handled according to the Privacy Policy.",
        "ThanNow uses configured hosting, storage, AI-processing, and payment providers where needed to operate the service. Complete payment card credentials are handled by the authorized payment provider where applicable.",
        "Customers may contact support to request deletion where the current system and legal obligations permit it."
      ]},
      { title: "Support", text: "Contact ThanNow at +923354299783 or gisupp@gmail.com for order, payment, delivery, or privacy questions." }
    ]} />
  </CompliancePage>;
}

export function TermsPage() {
  return <CompliancePage title="Terms and Conditions" description="The terms that apply when you use ThanNow services or place an order.">
    <Sections sections={[
      { title: "1. Introduction and acceptance", text: "ThanNow, operated by BioTech, provides photo restoration, enhancement, upscaling, digital delivery, and selected physical print services. By using the website or placing an order, you accept these Terms and Conditions and the linked policies." },
      { title: "2. Eligibility and acceptable use", text: "You must be able to enter a binding agreement and provide accurate information. Do not upload illegal, abusive, infringing, deceptive, or harmful content, or use the platform to violate another person's rights." },
      { title: "3. Services and AI processing", text: "Services may include digital restoration, image enhancement, upscaling, printing, canvas, and framed products where currently offered. Processing may use AI-assisted reconstruction. AI can produce imperfect results, especially where source information is missing, and facial or image reconstruction is not guaranteed to be exact." },
      { title: "4. Customer files and responsibility", items: ["You confirm that you own or have permission to use each uploaded photograph and that your instructions are lawful.", "You are responsible for reviewing the selected files, quality, size, quantity, delivery information, and order summary before confirmation.", "ThanNow may refuse or stop content that appears illegal, unsafe, infringing, or unsuitable for the service."] },
      { title: "5. Orders, pricing, tax, and payment", text: "An order is confirmed only when the website and server accept it. Current prices are supplied by the catalog and shown before payment. Applicable taxes or charges are shown where applicable. Advance-payment orders enter processing after successful payment confirmation. Failed or cancelled payments do not create a successfully paid order; suspected duplicate transactions should be reported to support." },
      { title: "6. Delivery and fulfilment", text: "Digital files are delivered through the order flow when processing is complete. Physical prints are fulfilled using the arrangements available for the order. You must provide accurate contact and delivery information. Courier, network, weather, and other events outside reasonable control can cause delay." },
      { title: "7. Cancellation, refunds, and replacements", text: "Cancellation may be possible before processing starts, depending on order status. Customized digital products normally cannot be returned after successful completion and delivery. ThanNow investigates genuine technical failures and verified incorrect or defective physical products under the Refund and Exchange Policy." },
      { title: "8. Intellectual property and privacy", text: "You retain rights in content you submit, subject to the permissions needed to provide the service. ThanNow's website, branding, and service materials remain protected. Personal information and photographs are handled under the Privacy Policy." },
      { title: "9. Availability and liability", text: "ThanNow aims to keep the service available but does not guarantee uninterrupted access or a particular AI result. To the extent permitted by Pakistan law, ThanNow is not liable for indirect loss, customer-supplied errors, unlawful content, or events outside reasonable control. Nothing in these terms excludes liability that cannot legally be excluded." },
      { title: "10. Changes, support, and law", text: "Services and these terms may change as the platform develops; the current version is published on this website. Questions and disputes should first be sent to gisupp@gmail.com or +923354299783. These terms are governed by applicable Pakistan law and subject to the jurisdiction of the competent courts in Pakistan." }
    ]} />
  </CompliancePage>;
}

export function PrivacyPolicyPage() {
  return <CompliancePage title="Privacy Policy" description="How ThanNow handles customer information, uploaded photographs, orders, and support requests.">
    <Sections sections={[
      { title: "Information we collect", items: ["Name, phone number, email, and other contact details supplied for an order or support request.", "Order, selected service, payment status, delivery, and support information.", "Uploaded photographs and files needed to provide restoration, enhancement, upscaling, or printing.", "Technical information such as browser, device, network, and basic usage data where collected by the running service."] },
      { title: "How we use information", text: "ThanNow uses this information to authenticate customers where applicable, create and fulfil orders, process photographs, provide downloads or physical fulfilment, communicate about an order, prevent misuse, maintain security, and meet legal obligations." },
      { title: "Photographs and AI-assisted processing", text: "Uploaded photographs are sent through the configured storage and processing flow needed to provide the selected service. AI-assisted processing may reconstruct or enhance image areas; it does not change the customer's ownership rights. ThanNow does not promise that every output will be an exact reproduction." },
      { title: "Providers and payments", text: "ThanNow may use configured hosting, database, file-storage, AI-processing, analytics, communications, courier, and payment providers to operate the service. Complete payment card credentials are handled through the authorized payment provider where applicable; ThanNow should not be treated as storing those complete credentials." },
      { title: "Cookies and analytics", text: "The website may use essential browser storage or cookies needed for authentication, guest order ownership, security, and basic operation. Analytics or optional cookies are used only where enabled in the current deployment. Customers can control browser storage through their browser settings, although doing so may affect functionality." },
      { title: "Security, retention, and deletion", text: "ThanNow applies reasonable technical and organizational safeguards appropriate to the service. Information and photographs are retained only as needed for processing, delivery, support, security, legal obligations, and the configured operational workflow; exact retention periods are not promised here. Contact support to request deletion where supported and legally permitted." },
      { title: "Communication and legal requests", text: "ThanNow may contact customers about orders, payments, delivery, account security, and support. Information may be disclosed when required by law, valid legal process, or to protect the service and others." },
      { title: "Children and third parties", text: "The service is not directed at children who cannot lawfully use it. Do not submit a child's photograph without the appropriate permission. Third-party sites and providers have their own policies, which should be reviewed when relevant." },
      { title: "Changes and privacy contact", text: "This policy may be updated when the service changes. For privacy questions or requests, contact gisupp@gmail.com or +923354299783." }
    ]} />
  </CompliancePage>;
}

export function PaymentPolicyPage() {
  return <CompliancePage title="Payment Policy" description="Payment, currency, checkout confirmation, and duplicate-transaction guidance for ThanNow customers.">
    <Sections sections={[
      { title: "Currency and amount", items: ["Pakistan customer prices are displayed in PKR.", "Applicable service, print, delivery, and other charges are shown before payment confirmation.", "Review the final payable amount and the selected product before submitting payment."] },
      { title: "Payment processing", text: "Orders requiring advance payment are processed after successful payment confirmation. Available methods are only those shown at checkout. Bank Alfalah APG may be used as an authorized payment-processing channel. ThanNow does not claim to directly store complete card credentials when card handling occurs through that provider." },
      { title: "Failed, cancelled, and duplicate payments", text: "A failed payment does not create a successfully paid order. A cancelled transaction is not treated as successful. If a customer believes they were charged twice, contact ThanNow support with the order and transaction details. Verified duplicate collections are handled under the applicable refund procedure, and timing can depend on the issuing bank or payment provider." },
      { title: "Prohibited payment methods", text: "ThanNow does not accept or display cryptocurrency payment facilities. No Bitcoin, BTC, USDT, Ethereum, crypto wallet, or similar digital-currency payment option is offered. Customers should contact support for payment disputes." }
    ]} />
  </CompliancePage>;
}

export function RefundExchangePolicyPage() {
  return <CompliancePage title="Refund and Exchange Policy" description="How ThanNow reviews cancellations, digital service failures, and defective or incorrect physical products.">
    <Sections sections={[
      { title: "Digital restoration and digital products", items: ["Cancellation may be possible before processing starts, depending on the order status.", "Digital restoration is a customized service based on the customer's photograph. After customized processing is completed and delivered, it normally cannot be returned like a physical product.", "ThanNow investigates genuine failures including the wrong customer image being processed, non-delivery, a corrupted output, technical processing failure, duplicate payment, or a material processing error attributable to ThanNow.", "After verification, ThanNow may correct, reprocess, replace, or refund the affected service where appropriate. Subjective dissatisfaction with an AI interpretation does not promise an automatic refund."] },
      { title: "Physical prints", text: "Report a wrong product, wrong confirmed size, damage before or during delivery, significant printing defect, or an incorrect image caused by ThanNow's processing promptly after receiving the order. Include the order details and photographs or other evidence. Verified issues may qualify for correction, replacement, or refund review." },
      { title: "Exchanges", text: "Personalized printed products normally cannot be exchanged simply because a customer changes their mind after production. Defective or incorrect products are handled according to the verified issue." },
      { title: "How to contact support", text: "Send the order number, a description of the issue, and relevant evidence to gisupp@gmail.com or call +923354299783. Refund timing may depend on the payment provider or issuing bank." }
    ]} />
  </CompliancePage>;
}

export function DeliveryPolicyPage() {
  return <CompliancePage title="Delivery Policy" description="How digital files and physical print orders are delivered through the ThanNow service.">
    <Sections sections={[
      { title: "Digital delivery", text: "Completed digital restoration or enhancement files are made available through the order flow after successful payment and processing. The order status page indicates when a download is ready." },
      { title: "Physical print delivery", text: "Physical print delivery is available only for products and destinations supported by the current checkout and fulfilment flow. The order summary shows the delivery charge and the physical product distinction before payment. ThanNow does not promise unsupported locations, courier names, fees, or delivery times." },
      { title: "Customer information", text: "Customers are responsible for accurate recipient, phone, address, city, and other delivery information. Incorrect or incomplete details can cause failed delivery or additional handling." },
      { title: "Delays, missing, or damaged packages", text: "Courier or network disruption, weather, public events, and other circumstances outside reasonable control can delay delivery. Contact ThanNow promptly about a missing or damaged package with the order details and photographs of the package or product. ThanNow will investigate with the available fulfilment provider and apply the Refund and Exchange Policy where appropriate." }
    ]} />
  </CompliancePage>;
}

export function ContactPage() {
  return <CompliancePage title="Contact Us" description="Contact ThanNow for order, payment, delivery, or privacy support."><div className="card contact-card"><h2>ThanNow</h2><p><strong>Operated by:</strong> BioTech</p><p><strong>Office:</strong> 28-E, Gulshan-e-Ali Sahiwal</p><p><strong>Phone:</strong> <a href="tel:+923354299783">+923354299783</a></p><p><strong>Email:</strong> <a href="mailto:gisupp@gmail.com">gisupp@gmail.com</a></p><p><strong>Website:</strong> <a href="http://www.thannow.com">www.thannow.com</a></p><p><strong>Business Hours:</strong> 9am - 5am (only working Days)</p></div></CompliancePage>;
}
