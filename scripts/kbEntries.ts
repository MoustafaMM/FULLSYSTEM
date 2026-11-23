/** Starter answers for the Sales Assistant (placeholder wording — edit in Admin → Chatbot Answers). */
export const entries = [
  {
    category: 'Internal process',
    question: 'How does the confidence % work?',
    answer: 'Lead: you set 0–79%.\nPredicted: set 80% when the student is committed (the most you can enter).\nVisa Paid: record the payment receipt — the student goes to 100% and is added to the Visa Tracker automatically.\nRegistered: Admission confirms enrolment — the deal is Done.',
    keywords: ['confidence', 'percentage', 'predicted', '80', '100', 'pipeline', 'stage'],
  },
  {
    category: 'Internal process',
    question: 'What happens after I record the visa payment?',
    answer: '1. Student moves to Visa Paid (100%).\n2. A Visa Tracker entry is created and EMGS status is checked automatically.\n3. Admission reviews the application.\n4. Logistics gets airport pickup and accommodation tasks.',
    keywords: ['visa paid', 'payment', 'receipt', 'after payment', 'tracker'],
  },
  {
    category: 'Internal process',
    question: 'Which documents are required?',
    answer: 'Passport (all pages), passport photo, offer letter, academic certificates, transcripts and English test result. Submit each as a Drive link on the student page; Admission approves or rejects with a note.',
    keywords: ['documents', 'papers', 'required', 'checklist', 'passport', 'transcript'],
  },
  {
    category: 'Visa / EMGS',
    question: 'How long does the EMGS visa take?',
    answer: '[Replace with your standard answer — typical processing time and the main stages students see on EMGS.]',
    keywords: ['emgs', 'how long', 'processing time', 'visa time', 'eval'],
  },
  {
    category: 'Products & pricing',
    question: 'What are our service packages and prices?',
    answer: '[Replace with your packages, what each includes and the price.]',
    keywords: ['price', 'pricing', 'package', 'fee', 'cost', 'how much'],
  },
  {
    category: 'University process',
    question: 'What is the admission process for UTM?',
    answer: '[Replace with the UTM steps: application portal, documents, offer letter timeline, fee payment, EMGS submission.]',
    keywords: ['utm', 'universiti teknologi malaysia'],
  },
];
