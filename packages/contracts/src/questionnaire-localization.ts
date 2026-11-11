import { questionnaire, type Question } from './questionnaire';
import { languages, type Locale } from './locales';
const sections: Record<string, string> = {
  Élethelyzet: 'Life situation',
  'Munka és biztonság': 'Work and security',
  Habitus: 'Temperament',
  'Irányok és kapcsolatok': 'Direction and relationships',
};
const labels: Record<string, { label: string; help?: string }> = {
  ageBand: { label: 'Which age group are you in?' },
  region: {
    label: 'Which county or region do you live in?',
    help: 'We do not ask for your exact address.',
  },
  regionType: { label: 'What type of settlement do you live in?' },
  relationshipStatus: {
    label: 'What best describes your relationship situation?',
  },
  children: { label: 'How many children do you have?' },
  employmentStatus: { label: 'What is your current work situation?' },
  workDomain: {
    label: 'What field do you work in, or want to work in?',
    help: 'You do not need to name your employer.',
  },
  workSatisfaction: { label: 'How satisfied are you with your work?' },
  financialStability: { label: 'How stable is your financial situation?' },
  housingStability: { label: 'How stable is your housing situation?' },
  relocationWillingness: { label: 'How open would you be to moving?' },
  careerChangeWillingness: {
    label: 'How open would you be to changing careers?',
  },
  riskTolerance: { label: 'How willing are you to take risks?' },
  changeSeeking: { label: 'How much do you seek change?' },
  persistence: { label: 'How persistent are you when pursuing a goal?' },
  sociability: { label: 'How much do you seek the company of others?' },
  planningOrientation: { label: 'How much do you plan ahead?' },
  conflictAvoidance: { label: 'How much do you avoid conflict?' },
  autonomyNeed: { label: 'How important is independence to you?' },
  securityNeed: { label: 'How important is predictability to you?' },
  familyOrientation: { label: 'How central is family in your life?' },
  careerAmbition: {
    label: 'How important is professional advancement to you?',
  },
  learningOrientation: {
    label: 'How much do you seek learning opportunities?',
  },
  adaptability: { label: 'How easily do you adapt to new situations?' },
  values: { label: 'Choose 3–5 important values, in order of importance.' },
  goalCategory: { label: 'Which area does your main goal relate to?' },
  goalTitle: {
    label: 'What would you like to achieve in the coming years?',
    help: 'One brief, specific goal is enough.',
  },
  noCloseRelationships: {
    label:
      'I do not currently have two close relationships I would like to add.',
    help: 'If you do not select this, we ask for at least two relationships in the summary.',
  },
};
const options: Record<string, string> = {
  '18_24': '18–24',
  '25_34': '25–34',
  '35_44': '35–44',
  '45_54': '45–54',
  '55_64': '55–64',
  '65_plus': '65+',
  capital: 'Budapest',
  city: 'City',
  small_town: 'Small town',
  village: 'Village',
  single: 'Single',
  partnered: 'In a relationship',
  married: 'Married',
  separated: 'Separated / divorced',
  widowed: 'Widowed',
  employed: 'Employed',
  self_employed: 'Self-employed',
  student: 'Student',
  seeking_work: 'Looking for work',
  retired: 'Retired',
  other: 'Other',
  family: 'Family',
  security: 'Security',
  autonomy: 'Freedom',
  learning: 'Learning',
  free_time: 'Free time',
  career: 'Career',
  community: 'Community',
  creativity: 'Creativity',
  adventure: 'Adventure',
  calm: 'Calm',
  finance: 'Finances',
  social: 'Relationships',
  lifestyle: 'Lifestyle',
};
type QuestionTranslation = {
  sections: typeof sections;
  labels: typeof labels;
  options: typeof options;
};
const translations: Record<Locale, QuestionTranslation | null> = {
  en: { sections, labels, options },
  hu: null,
};
export function getQuestionnaire(locale: Locale = 'en') {
  const translation = translations[locale];
  if (!translation) return questionnaire;
  const questions: Question[] = questionnaire.questions.map((question) => {
    const localized = translation.labels[question.key];
    if (!localized || !translation.sections[question.section])
      throw new Error(`Question translation missing: ${question.key}`);
    return {
      ...question,
      label: localized.label,
      section: translation.sections[question.section]!,
      ...('help' in question ? { help: localized.help } : {}),
      ...(question.options
        ? {
            options: question.options.map((option) => {
              const label = translation.options[option.value];
              if (!label)
                throw new Error(
                  `Option translation missing: ${question.key}.${option.value}`,
                );
              return { value: option.value, label };
            }),
          }
        : {}),
    };
  });
  // Presentation only: do not replace the immutable stored HU questionnaire.
  return {
    ...questionnaire,
    locale: languages[locale].intlTag,
    localizationVersion: '1.0.0',
    questions,
  };
}
