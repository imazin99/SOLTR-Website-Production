/**
 * SOLTR — seedPolicies.js
 * Seeds the initial content for every footer policy page.
 *
 * SAFE TO RE-RUN: only CREATES a policy if its slug doesn't already
 * exist. It never overwrites a policy that's already in the database —
 * so content edited via the Admin Dashboard is never at risk of being
 * silently reverted by re-running this script. If you genuinely want
 * to reset a specific policy back to this seed text, delete that one
 * document from MongoDB first (or edit it directly in the dashboard).
 *
 * Run once (or any time — it's idempotent):  node seedPolicies.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Policy   = require('./models/Policy');

const SEED = [
  {
    slug: 'return-refund',
    title: 'Return & Refund',
    content: [
      'At Soltr, your satisfaction is our priority. If you are looking to return or exchange your order, we\u2019re here to help:',
      'Policy Duration: You can request a return or exchange within 14 days of receiving your order.',
      'Item Condition: Items must be returned in their original condition: unworn, unwashed, and with all original tags and packaging intact.',
      'Exchanges: You can exchange for a different size or style (subject to availability). Any price difference will be adjusted accordingly.',
      'Refunds: Once we receive and inspect your item, the refund will be processed via your original payment method or through bank transfer/e-wallet.',
      'Shipping Costs: Customers are responsible for the shipping fees for returns or exchanges, unless the item received is defective or incorrect.',
    ].join('\n'),
  },
  {
    slug: 'shipping-policy',
    title: 'Shipping Policy',
    content: [
      'At Soltr Wear, we strive to get your fresh gear to you as quickly as possible:',
      'Delivery Time: Orders within Egypt are typically delivered within 2 to 5 business days from the date of confirmation.',
      'Order Tracking: Once your order is shipped, you will receive an email or SMS with your tracking details.',
      'Shipping Fees: Shipping costs are calculated at checkout based on your location. Cash on Delivery (COD) is available.',
      'Note: Please ensure your shipping address and phone number are accurate to avoid any delays in delivery.',
    ].join('\n'),
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    content: `Welcome to Soltr Wear! The terms "we", "us" and "our" refer to Soltr Wear. Soltr Wear operates this store and website, including all related information, content, features, tools, products and services in order to provide you, the customer, with a curated shopping experience (the "Services").
The below terms and conditions, together with any policies referenced herein (these "Terms of Service" or "Terms") describe your rights and responsibilities when you use the Services.
Please read these Terms of Service carefully, as they include important information about your legal rights and cover areas such as warranty disclaimers and limitations of liability.
By visiting, interacting with or using our Services, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these Terms of Service or Privacy Policy, you should not use or access our Services.
SECTION 1 - ACCESS AND ACCOUNT
By agreeing to these Terms of Service, you represent that you are at least the age of majority in your state or province of residence, and you have given us your consent to allow any of your minor dependents to use the Services on devices you own, purchase or manage.
To use the Services, including accessing or browsing our online stores or purchasing any of the products or services we offer, you may be asked to provide certain information, such as your email address, billing, payment, and shipping information. You represent and warrant that all the information you provide in our stores is correct, current and complete and that you have all rights necessary to provide this information.
You are solely responsible for maintaining the security of your account credentials and for all of your account activity. You may not transfer, sell, assign, or license your account to any other person.
SECTION 2 - OUR PRODUCTS
We have made every effort to provide an accurate representation of our products and services in our online stores. However, please note that colors or product appearance may differ from how they may appear on your screen due to the type of device you use to access the store and your device settings and configuration.
All descriptions of products are subject to change at any time without notice at our sole discretion. We reserve the right to discontinue any product at any time and may limit the quantities of any products that we offer to any person, geographic region or jurisdiction, on a case-by-case basis.
SECTION 3 - ORDERS
When you place an order, you are making an offer to purchase. Soltr Wear reserves the right to accept or decline your order for any reason at its discretion. Your order is not accepted until Soltr Wear confirms acceptance.
Your purchases are subject to return or exchange solely in accordance with our Refund Policy.
SECTION 4 - PRICES AND BILLING
Prices, discounts and promotions are subject to change without notice. The price charged for a product or service will be the price in effect at the time the order is placed and will be set out in your order confirmation email. Unless otherwise expressly stated, posted prices do not include taxes, shipping, handling, customs or import charges.
SECTION 5 - SHIPPING AND DELIVERY
We are not liable for shipping and delivery delays. All delivery times are estimates only and are not guaranteed. Once we transfer products to the carrier, title and risk of loss passes to you.
SECTION 6 - INTELLECTUAL PROPERTY
Our Services, including but not limited to all trademarks, brands, text, displays, images, graphics, product reviews, video, and audio, and the design, selection, and arrangement thereof, are owned by Soltr Wear, its affiliates or licensors.
SECTION 7 - PROHIBITED USES
You may not use the Services for any unlawful purpose, to violate any regulations, to infringe on intellectual property rights, to harass or harm others, to transmit false information, to send spam, to impersonate any person or entity, or to interfere with the security of the Services.
SECTION 8 - TERMINATION
We may terminate this agreement or your access to the Services in our sole discretion at any time without notice.
SECTION 9 - DISCLAIMER OF WARRANTIES
The Services and all products offered through the Services are provided "as is" and "as available", without any warranties of any kind, either express or implied.
SECTION 10 - GOVERNING LAW
These Terms of Service shall be governed by and construed in accordance with the laws of the jurisdiction where Soltr Wear is headquartered.
SECTION 11 - CHANGES TO TERMS OF SERVICE
We reserve the right to update these Terms of Service at any time. Your continued use of the Services following any changes constitutes acceptance of those changes.
SECTION 12 - CONTACT INFORMATION
Questions about the Terms of Service should be sent to us at soltrwear@gmail.com.
Trade name: Soltr Wear
Phone number: 01035544676
Email: soltrwear@gmail.com
Physical address: Beni Suef, online, BNS, beni suef, 62511, Egypt`,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    content: `This Privacy Policy explains what personal information Soltr Wear collects when you shop with us, why we collect it, and how it's used and protected. It covers only the systems that are actually part of the Soltr Wear store — there are no third-party integrations, partners, or services beyond what's described below.
INFORMATION WE COLLECT
Account Information: If you create a customer account, we collect your name, email address, phone number (optional), and a password. Your password is never stored as plain text — see Password Protection below.
Order Information: When you place an order, whether or not you are logged into an account, we collect the name, phone number, email address, shipping address, and city you provide, along with the products, sizes, and quantities you ordered.
Saved Addresses: If you save an address to your account for faster checkout, we store the label, full name, phone number, address, and city you enter for that address.
Reviews: If you submit a product review, we collect the name you provide, your star rating, and your review text. This information is shown publicly alongside the product.
Anonymous Browsing Data: Even if you don't create an account, your browser is assigned a random, anonymous visitor ID (stored in your browser's local storage) so your cart and wishlist work correctly and so we can keep a basic count of store visits.
HOW WE USE YOUR INFORMATION
We use the information above to: process and fulfill your orders; apply coupons and calculate order totals; match your account to orders you've previously placed using the same email address; keep your saved addresses available for future checkouts; display your product reviews to other shoppers; respond to questions or support requests you send us.
We do not sell your information, and we do not share it with advertisers or data brokers.
CHECKOUT VIA WHATSAPP
When you choose to complete an order through WhatsApp, the order details you've entered are placed into a pre-filled message that you then choose to send yourself through WhatsApp. Once that message is sent, it is handled by WhatsApp under WhatsApp's own terms and privacy practices, which are outside our control.
ACCOUNT SECURITY & AUTHENTICATION
Customer accounts and the Soltr Wear admin dashboard use two completely separate login systems with separate credentials, so a customer login can never be used to access the admin dashboard, and vice versa.
Password Protection: All passwords, for both customer accounts and the admin account, are hashed using bcrypt before they are stored. We never store or have access to your password in plain text.
HOW WE PROTECT YOUR INFORMATION
Your account and order information is stored in our database and is only accessible through authenticated requests. We take reasonable technical measures to protect this information, but no online system can be guaranteed to be 100% secure.
LOCAL STORAGE ON YOUR DEVICE
Soltr Wear does not use tracking cookies. Instead, some information is kept in your own browser's local storage: the contents of your shopping cart, your anonymous visitor ID, and, if you're logged in, your session token. This information stays on your device and is used only to make the site work correctly.
YOUR RIGHTS
You can view and update your name and phone number, change your password, and manage your saved addresses at any time from My Account. If you'd like a copy of the personal information we hold about you, or would like us to delete your account, contact us using the details below.
CONTACT US
If you have any questions about this Privacy Policy, contact us at soltrwear@gmail.com or 01035544676. Our address is Beni Suef, online, BNS, Beni Suef, 62511, Egypt.`,
  },
  {
    slug: 'contact-information',
    title: 'Contact Information',
    content: [
      "We're always here to help. If you have any questions regarding your order, our collections, or anything else, feel free to reach out to us:",
      'Email: soltrwear@gmail.com',
      'Phone / WhatsApp: +20 103 554 4676',
      'Location: Beni Suef,Egypt.',
      'You can also slide into our DMs on Instagram or Facebook, and our team will get back to you as soon as possible.',
    ].join('\n'),
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    for (const doc of SEED) {
      const existing = await Policy.findOne({ slug: doc.slug });

      if (existing) {
        console.log(`⏭  Skipped ${doc.slug} — already exists (${existing.title}, last updated ${existing.updatedAt}). Not overwritten.`);
        continue;
      }

      await Policy.create(doc);
      console.log(`✅ Created policy: ${doc.slug}`);
    }

    console.log('🌱 Done. Existing policies were left untouched — this script only creates ones that are missing.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
