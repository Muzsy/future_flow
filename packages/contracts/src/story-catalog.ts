export const STORY_CATALOG_VERSIONS = ['1.0.0'] as const;
export const STORY_CATALOG_VERSION = '1.0.0';

export const storyCatalogs = {
  '1.0.0': {
    version: '1.0.0',
    directions: {
      relationships: {
        selectable: true,
        flag: 'default',
        goalCategory: 'relationships',
        compatibleWith: [],
        engine: {
          focus:
            'People and bonds are the centre of this life: closeness, trust, loyalty, distance and how relationships change. Work, money and plans matter mainly through what they do to the people involved.',
          decisions:
            'The closing decision is usually about a person or a bond: what to say or withhold, whom to stand by, how close to come, what to forgive, what to commit to.',
          avoid:
            'Do not turn the story into a self-improvement plan or a career arc. Do not use other people as coaches or therapy devices. Intimacy stays non-explicit; never present jealousy or control as romance. Supplied people keep relationship state only.',
          continuity:
            'Record a changed bond (closer, strained, ended, repaired) as a relationshipUpdate, and what was said or promised as a continuity storyFact when a later chapter relies on it.',
          hardLimits: [],
        },
        subtypes: {
          romantic: {
            engine: {
              focus:
                'Romantic partnership and attraction carry the emphasis, within the casting rules.',
            },
          },
          friendship: {
            engine: {
              focus:
                'Friendships and belonging carry the emphasis; do not turn a friendship into romance on your own initiative.',
            },
          },
          family: {
            engine: {
              focus:
                'Family ties, expectations and roles carry the emphasis; do not turn the story toward romance on your own initiative.',
            },
          },
          mixed: {
            engine: {
              focus:
                'All close bonds matter: partner, family and friends compete for time and loyalty.',
            },
          },
        },
        situations: {
          'rel.new_city': {
            subtypes: ['romantic', 'friendship', 'mixed'],
            selectable: true,
            engine: {
              brief:
                'You moved recently, know few people, and every connection is only now taking shape.',
            },
          },
          'rel.long_partnership_turn': {
            subtypes: ['romantic'],
            selectable: true,
            engine: {
              brief:
                'You have been together for years; something has shifted and the next step is unclear.',
            },
          },
          'rel.after_breakup': {
            subtypes: ['romantic', 'mixed'],
            selectable: true,
            engine: {
              brief:
                'An important relationship has ended; shared friends, habits and evenings need a new place.',
            },
          },
          'rel.unexpected_someone': {
            subtypes: ['romantic'],
            selectable: true,
            engine: {
              brief:
                'Someone has appeared in your ordinary life and it is not yet clear what this will become.',
            },
          },
          'rel.drifting_friends': {
            subtypes: ['friendship'],
            selectable: true,
            engine: {
              brief:
                'Your old group meets less often; you have to decide whom the effort is for.',
            },
          },
          'rel.old_friend_returns': {
            subtypes: ['friendship', 'mixed'],
            selectable: true,
            engine: {
              brief:
                'After years someone returns with whom you share a long past and some unfinished business.',
            },
          },
          'rel.new_circle': {
            subtypes: ['friendship'],
            selectable: true,
            engine: {
              brief:
                'You joined a group (a club, choir, team or neighbourhood) where you are still finding your place.',
            },
          },
          'rel.family_expectations': {
            subtypes: ['family'],
            selectable: true,
            engine: {
              brief:
                'Your family expects something other than what you want; affection and independence are both at stake.',
            },
          },
          'rel.new_family_role': {
            subtypes: ['family'],
            selectable: true,
            engine: {
              brief:
                'Who relies on whom in the family has changed (a move, a new family member, tasks to share).',
            },
          },
          'rel.reconnecting_relative': {
            subtypes: ['family', 'mixed'],
            selectable: true,
            engine: {
              brief:
                'You and a relative grew apart; now there is an opening to come closer.',
            },
          },
          'rel.shared_home': {
            subtypes: ['romantic', 'family', 'mixed'],
            selectable: true,
            engine: {
              brief:
                'You live together (as a couple, family or flatmates) and the rules of sharing a home are being rewritten.',
            },
          },
        },
      },
      career: {
        selectable: true,
        flag: 'default',
        goalCategory: 'career',
        compatibleWith: [],
        engine: {
          focus:
            'Work is the centre of this life: what the protagonist does, who they work with or for, what they are trusted with and what it costs elsewhere.',
          decisions:
            'The closing decision is usually a working choice with a human side: what to take on or refuse, whom to back, when to speak, what to risk.',
          avoid:
            'This is fiction, not business, financial, legal or career advice: no recommendations to the reader, no checklists, no forecasts, no guaranteed or typical outcomes. Success is never promised and failure is never punishment. Do not resolve every period with a new offer.',
          continuity:
            'Record commitments later periods depend on (a contract, a debt, a hire, a promise to a partner or customer) as typed changes where the state has a field, otherwise as promise or outcome storyFacts.',
          hardLimits: [],
        },
        subtypes: {
          employee: {
            engine: {
              focus:
                'The protagonist builds a path inside organisations they do not own: colleagues, managers, roles and reputation.',
            },
          },
          founder: {
            engine: {
              focus:
                'The protagonist builds a business of their own: customers, money, partners, first hires and the weight of deciding alone. Show the ordinary work of a small business, not startup mythology.',
            },
          },
          transition: {
            engine: {
              focus:
                "The protagonist holds a job while building something of their own. Whether and when to leave the job is the reader's decision, never the system's.",
            },
          },
        },
        situations: {
          'car.first_real_role': {
            subtypes: ['employee'],
            selectable: true,
            engine: {
              brief:
                'You are starting somewhere new, have to prove yourself and learn the unwritten rules.',
            },
          },
          'car.plateau': {
            subtypes: ['employee'],
            selectable: true,
            engine: {
              brief:
                'You have been in the same place for years and are weighing promotion, a move or a new field.',
            },
          },
          'car.first_time_lead': {
            subtypes: ['employee'],
            selectable: true,
            engine: {
              brief:
                'You were given a small team; former peers now report to you.',
            },
          },
          'car.reorganisation': {
            subtypes: ['employee'],
            selectable: true,
            engine: {
              brief:
                'The company is being reorganised; roles, alliances and openings are being redistributed.',
            },
          },
          'car.idea_stage': {
            subtypes: ['founder'],
            selectable: true,
            engine: {
              brief:
                'You have an idea and some reserves; there is no customer, partner or registered company yet.',
            },
          },
          'car.first_customers': {
            subtypes: ['founder'],
            selectable: true,
            engine: {
              brief:
                'The business has started and has a few paying customers; money is short and the work is plenty.',
            },
          },
          'car.cofounder_tension': {
            subtypes: ['founder'],
            selectable: true,
            engine: {
              brief:
                'The two of you built it this far and see the next step differently.',
            },
          },
          'car.family_business': {
            subtypes: ['founder'],
            selectable: true,
            engine: {
              brief:
                'You are taking over a small working business; the old ways and your own ideas collide.',
            },
          },
          'car.growth_strain': {
            subtypes: ['founder'],
            selectable: true,
            engine: {
              brief:
                'There are more orders than you can handle; you must hire, find money or say no.',
            },
          },
          'car.side_project': {
            subtypes: ['transition'],
            selectable: true,
            engine: {
              brief:
                'You build something in the evenings beside a full-time job; time and energy are limited.',
            },
          },
          'car.notice_decision': {
            subtypes: ['transition'],
            selectable: true,
            engine: {
              brief:
                'Your own venture looks viable; you have to decide when and how to leave.',
            },
          },
          'car.part_time_bridge': {
            subtypes: ['transition'],
            selectable: true,
            engine: {
              brief:
                'You work reduced hours to make room for the business, and both sides ask for more.',
            },
          },
        },
      },
      creative: {
        selectable: true,
        flag: 'default',
        goalCategory: 'personal_growth',
        compatibleWith: [],
        engine: {
          focus:
            'Making things is the centre of this life: the work itself, the people around it and its place among ordinary obligations. Respect whether the practice is private, shared or a livelihood.',
          decisions:
            'The closing decision is usually about the work or its place: what to make, show, change, protect or give up time for.',
          avoid:
            'Do not treat creating as a career unless the role is livelihood, and even then do not measure every period by recognition, sales or audience. Outside validation is not the default turn. For a private practice never push toward publication, exhibition or income.',
          continuity:
            'Record works in progress, finished pieces and what was shown to whom as artifact or outcome storyFacts so later chapters can return to them.',
          hardLimits: [],
        },
        subtypes: {
          personal: {
            engine: {
              focus: 'The practice is for its own sake.',
            },
          },
          sharing: {
            engine: {
              focus: 'The protagonist wants the work to meet other people.',
            },
          },
          livelihood: {
            engine: {
              focus:
                'The protagonist wants to live from the work, with the money and compromise that involves.',
            },
          },
        },
        situations: {
          'cre.returning': {
            subtypes: ['personal', 'sharing'],
            selectable: true,
            engine: {
              brief:
                'After years away you have taken it up again and are finding room for it in ordinary days.',
            },
          },
          'cre.private_work': {
            subtypes: ['personal'],
            selectable: true,
            engine: {
              brief:
                'You make things regularly and have shown them to nobody so far.',
            },
          },
          'cre.first_showing': {
            subtypes: ['sharing', 'livelihood'],
            selectable: true,
            engine: {
              brief:
                'Your work is about to meet other people for the first time (a show, a performance, a reading or a submission).',
            },
          },
          'cre.shared_studio': {
            subtypes: ['personal', 'sharing', 'livelihood'],
            selectable: true,
            engine: {
              brief:
                'You share a space, rehearsals or a project with others whose tastes and ambitions differ from yours.',
            },
          },
          'cre.commission_vs_own': {
            subtypes: ['livelihood'],
            selectable: true,
            engine: {
              brief:
                'Paid commissions arrive and leave little time for your own material.',
            },
          },
          'cre.day_job': {
            subtypes: ['personal', 'sharing', 'livelihood'],
            selectable: true,
            engine: {
              brief:
                'You have a steady job and create in your free time; each would like more of you.',
            },
          },
          'cre.big_project': {
            subtypes: ['personal', 'sharing', 'livelihood'],
            selectable: true,
            engine: {
              brief:
                'You are halfway through a longer work (an album, a series, a manuscript, a design) and finishing is uncertain.',
            },
          },
        },
      },
      travel: {
        selectable: true,
        flag: 'default',
        goalCategory: 'lifestyle',
        compatibleWith: [],
        engine: {
          focus:
            'Movement and unfamiliar places are the centre of this life: arriving, staying, leaving, and the people met on the way and left behind.',
          decisions:
            'The closing decision is usually about going or staying, with whom, and what is kept at home.',
          avoid:
            'Avoid day-by-day itineraries and guidebook prose. Use real countries and cities only as general settings; invent small places, businesses and people. State nothing about visas, laws, prices or safety as fact and give no travel advice.',
          continuity:
            'Record each lasting move with location_set and people met on the road who may return with actor_add.',
          hardLimits: [],
        },
        subtypes: {
          work: {
            engine: {
              focus: 'Travel comes with the job.',
            },
          },
          lifestyle: {
            engine: {
              focus:
                'Travel is the chosen way of living; there may be no fixed home.',
            },
          },
          journey: {
            engine: {
              focus:
                'One journey of several months, or its aftermath, frames the story.',
            },
          },
        },
        situations: {
          'trv.posting': {
            subtypes: ['work'],
            selectable: true,
            engine: {
              brief:
                'Work takes you to another city or country for some months while life at home carries on.',
            },
          },
          'trv.road_job': {
            subtypes: ['work'],
            selectable: true,
            engine: {
              brief:
                'Your job means constant travel and home is more of a starting point.',
            },
          },
          'trv.field_assignment': {
            subtypes: ['work'],
            selectable: true,
            engine: {
              brief:
                'Research, reporting or a project keeps you for a long stretch in an unfamiliar place among locals.',
            },
          },
          'trv.remote_moving': {
            subtypes: ['lifestyle'],
            selectable: true,
            engine: {
              brief:
                'You can work from anywhere and live somewhere else every few weeks or months.',
            },
          },
          'trv.seasonal': {
            subtypes: ['lifestyle'],
            selectable: true,
            engine: {
              brief:
                'You live between seasonal jobs and places; each season brings a new place and new people.',
            },
          },
          'trv.slow_savings': {
            subtypes: ['lifestyle'],
            selectable: true,
            engine: {
              brief:
                'You left your previous way of living and travel on savings for as long as they last.',
            },
          },
          'trv.long_route': {
            subtypes: ['journey'],
            selectable: true,
            engine: {
              brief:
                'You are setting out on a long-planned journey of several months.',
            },
          },
          'trv.roots': {
            subtypes: ['journey'],
            selectable: true,
            engine: {
              brief:
                'Following a family story, you travel to where your people come from.',
            },
          },
          'trv.unplanned_stay': {
            subtypes: ['journey', 'lifestyle'],
            selectable: true,
            engine: {
              brief:
                'It began as a short trip, but a place, a person or an opening keeps you there.',
            },
          },
          'trv.shared_journey': {
            subtypes: ['journey'],
            selectable: true,
            engine: {
              brief:
                'You set out with someone, and the road shows how well you travel together.',
            },
          },
        },
      },
      politics: {
        selectable: true,
        flag: 'politics',
        goalCategory: 'other',
        compatibleWith: [],
        engine: {
          focus:
            'Invented public life is the centre: alliances, loyalty, procedure, ambition, public trust and compromise inside wholly fictional institutions. Name at most three invented institutions or factions at the start.',
          decisions:
            'The closing decision is usually about position and loyalty: whom to back, what to trade, what to disclose, when to break ranks.',
          avoid:
            'Do not turn the story into commentary on real politics or a civics lesson. Keep the scale human: people, loyalties and procedure rather than programmes and slogans. Intrigue works through negotiation, procedure, favours, leaks and reputation.',
          continuity:
            'Register each invented institution, faction or office once as a setting storyFact. Record an alliance, rivalry, favour owed or change of standing as a relationship_detail or promise storyFact and supersede it when it changes.',
          hardLimits: [
            'Every institution, party, movement, office holder and public figure in this story is invented. No real politician, party, movement, government, election or current political event is named, portrayed or judged; a real name found in user text is replaced by a clearly invented counterpart and no real-world political fact is stated.',
            'The story argues for or against no real-world political position and assigns no real-world ideology to the protagonist or to supplied people.',
            'Intrigue stays non-violent: no threat, intimidation or harm.',
          ],
        },
        subtypes: {
          local: {
            engine: {
              focus: 'A town or district scale.',
            },
          },
          organization: {
            engine: {
              focus:
                'The inner politics of a party, union, chamber or association.',
            },
          },
          staff: {
            engine: {
              focus:
                'The protagonist works behind an elected or appointed person.',
            },
          },
          civic: {
            engine: {
              focus: 'The protagonist organises from outside the institutions.',
            },
          },
        },
        situations: {
          'pol.new_councillor': {
            subtypes: ['local'],
            selectable: true,
            engine: {
              brief:
                'You have joined the council of an invented town and must learn who stands with whom.',
            },
          },
          'pol.local_cause': {
            subtypes: ['local', 'civic'],
            selectable: true,
            engine: {
              brief:
                'You have become the voice of a contested local matter (a development, a public space, a school).',
            },
          },
          'pol.party_branch': {
            subtypes: ['organization'],
            selectable: true,
            engine: {
              brief:
                'You work in the local branch of an invented party where nominations and offices are contested.',
            },
          },
          'pol.union_or_chamber': {
            subtypes: ['organization'],
            selectable: true,
            engine: {
              brief:
                'You hold office in a union, chamber or association whose leadership is divided.',
            },
          },
          'pol.succession': {
            subtypes: ['organization'],
            selectable: true,
            engine: {
              brief:
                'The long-standing leader is stepping down, several people want the post, and each of them counts on you.',
            },
          },
          'pol.campaign_staff': {
            subtypes: ['staff'],
            selectable: true,
            engine: {
              brief:
                'You work on the team of an invented candidate and the campaign takes six months of your life.',
            },
          },
          'pol.adviser': {
            subtypes: ['staff'],
            selectable: true,
            engine: {
              brief:
                'You are a close aide to a decision-maker; information and requests pass through you.',
            },
          },
          'pol.petition': {
            subtypes: ['civic'],
            selectable: true,
            engine: {
              brief:
                'You lead a civic initiative and are gaining allies and opponents.',
            },
          },
          'pol.coalition': {
            subtypes: ['civic', 'organization'],
            selectable: true,
            engine: {
              brief:
                'You have to bring several organisations to one table for a shared cause.',
            },
          },
          'pol.sensitive_information': {
            subtypes: ['staff', 'civic', 'local'],
            selectable: true,
            engine: {
              brief:
                'You have learned something that would change how an invented public figure is seen, and what happens to it is up to you.',
            },
          },
        },
      },
    },
  },
} as const;

export type StoryCatalog = (typeof storyCatalogs)[keyof typeof storyCatalogs];
export type StoryDirectionId = keyof StoryCatalog['directions'];
