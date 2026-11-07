/**
 * House rules text (from HOUSE RULES.pdf). Shown on /rules for quick reference.
 * Tagalog is the source; English is a translation.
 */
export type RuleSection = { title_tl: string; title_en: string; items: { tl: string; en: string }[] };

export const RULES: RuleSection[] = [
  {
    title_tl: "Cat condo rules",
    title_en: "Cat condo rules",
    items: [
      { tl: "Tuwing magbubukas ng pinto, siguraduhin na hindi makakatakbo/makakalabas ang mga pusa.", en: "Whenever you open the door, make sure the cats cannot run out." },
      { tl: "Ang vacuum at mop na para sa mga pusa ay bawal gamitin sa labas. Pwede lang gamitin ang vacuum panglinis sa kwarto namin (malaking kwarto). Kapag gagamitin ang malaking vacuum sa kwarto ng mga pusa, kailangan muna itong linisan maigi lalo na ang gulong.", en: "The cats' vacuum and mop must not be used elsewhere. The cleaning vacuum may only be used in our (big) room. If the big vacuum is used in the cats' room, clean it thoroughly first — especially the wheels." },
      { tl: "Bawal magpasok ng tsinelas sa kwarto ng mga pusa.", en: "No slippers inside the cats' room." },
      { tl: "Bawal magdala ng mga pagkain pangtao sa kwarto ng mga pusa dahil baka may malaglag at makain nila. Bawal rin magdala ng drinks lalo na kape o softdrinks dahil baka mainuman nila ang baso.", en: "No human food in the cats' room — crumbs may drop and be eaten. No drinks either, especially coffee or soft drinks, since they may drink from the glass." },
      { tl: "Ang mga gamit ng pusa na kailangan hugasan (water fountains at food bowls) ay sa lababo sa labas huhugasan gamit ang sponge na nakalaan para sa kanila lang. Ang sponge na ito ay pinapalitan rin kapag marumi na.", en: "Cat items that need washing (water fountains and food bowls) are washed in the outside sink using the sponge reserved for them. Replace that sponge when it gets dirty." },
      { tl: "Ang litter boxes ay huhugasan sa may garahe (may sariling sponge).", en: "Litter boxes are washed in the garage (they have their own sponge)." },
      { tl: "Mineral water lang ang pwede nilang inumin. Palitan ang bote na lalagyan ng tubig kapag may bagong bote si mommy na naubos na ang laman.", en: "They may only drink mineral water. Swap the water bottle when mommy has a newly emptied bottle." },
      { tl: "Huwag basta basta magpasok ng mga gamit sa kwarto ng mga pusa dahil pwede nila itong paglaruan or makain (lalo na ang mga tali/ribbons/panali sa buhok o maliliit na gamit na madaling malunok). Siguraduhin na walang gamit na maiiwan sa loob ng kwarto ng mga pusa.", en: "Don't bring random items into the cats' room — they may play with or eat them (especially strings/ribbons/hair ties or small objects that are easy to swallow). Make sure nothing is left behind inside." },
      { tl: "Ang mga napulot na dumi (poop) at wipes na ginamit pangpulot ay sa litter box tray itatapon. Hindi pwede itapon sa plastic na basurahan sa labas dahil mangangamoy.", en: "Poop that is picked up, and the wipes used, go into the litter box tray — not the outside plastic bin (it will smell)." },
      { tl: "Ang mga napulot na suka at wipes na ginamit pangpulot, at wipes na ginamit sa pagpunas sa mga gamit ay pwedeng itapon sa plastic na basurahan sa labas.", en: "Vomit that is picked up, its wipes, and wipes used for wiping items can go in the outside plastic bin." },
      { tl: "Kapag nagpulot ng dumi at nagpalit ng plastic ng water fountain, ingatan na huwag humawak kung saan saan sa loob ng bahay hanggang sa maitapon sa tamang lagayan. Pagkatapos ay maghugas at magsabon agad ng kamay sa CR (bawal sa lababo sa kitchen).", en: "After picking up poop or changing the fountain plastic, avoid touching things around the house until it's disposed of properly. Then wash your hands with soap right away in the bathroom (not the kitchen sink)." },
    ],
  },
  {
    title_tl: "Responsibilities sa cat condo",
    title_en: "Responsibilities in the cat condo",
    items: [
      { tl: "Paglilinis: mag-vacuum (araw-araw) at mag-mop (kada weekend) gamit ang provided lamang na panglinis. Punasan ang mga gamit pati ang pader (kada weekend).", en: "Cleaning: vacuum (daily) and mop (every weekend) using only the provided cleaning tools. Wipe the items and the walls (every weekend)." },
      { tl: "Siguraduhin na may laman lagi ang tubig ng mga pusa at ang lagayan ng pagkain. Mag-report agad kapag may nakitang problema o sira.", en: "Make sure the cats' water and food containers are always filled. Report any problem or damage right away." },
      { tl: "I-refill ang litter box ng litter sand. Ayusin kung may problema sa litter box at palitan ang plastic ayon sa schedule o kapag bigla itong napuno.", en: "Refill the litter box with litter sand. Fix litter box problems and replace the plastic per schedule or when it suddenly fills up." },
      { tl: "Pulutin ang dumi (poop) at mga suka gamit ang wipes. I-check maigi ang mga ilalim ng mga gamit, ang loob ng carrier, at ang mga cat shelves na nasa pader dahil minsan ay doon sila sumusuka.", en: "Pick up poop and vomit with wipes. Check carefully under furniture, inside the carrier, and on the wall shelves — they sometimes vomit there." },
      { tl: "Buksan ang aircon tuwing 8-9AM at patayin ang aircon tuwing 9PM.", en: "Turn on the aircon at 8–9AM and turn it off at 9PM. (Note: the daily schedule says 6PM.)" },
      { tl: "Siguraduhin na hindi makalabas ang mga pusa sa pinto.", en: "Make sure the cats don't get out the door." },
      { tl: "Makipaglaro sa mga pusa minimum 10 minutes sa isang araw.", en: "Play with the cats at least 10 minutes a day." },
      { tl: "Suklayan ang mga pusa at least once a week.", en: "Comb the cats at least once a week." },
      { tl: "Gupitan ng kuko ang mga pusa every 2 weeks.", en: "Trim the cats' nails every 2 weeks." },
    ],
  },
  {
    title_tl: "Mga dapat i-report",
    title_en: "Things to report",
    items: [
      { tl: "Abnormal na poop, ihi, o suka.", en: "Abnormal poop, urine, or vomit." },
      { tl: "Abnormal na pag-uugali (gaya ng pabalik balik sa litter box, umiiyak, matamlay/malungkot/palaging nakahiga lang, nag-iika maglakad, at iba pa).", en: "Abnormal behaviour (going back and forth to the litter box, crying, lethargic/sad/always lying down, limping, etc.)." },
      { tl: "Kakaibang itsura ng pusa (may sugat, nakakalbo, may namamaga o namumulang parte ng katawan, nagmumuta, may sipon o ubo, may mga parasites na nakita sa balat, at iba pa).", en: "Unusual appearance (wounds, bald patches, swollen or red body parts, eye discharge, runny nose or cough, parasites on the skin, etc.)." },
      { tl: "Hindi kumakain at hindi umiinom ng tubig.", en: "Not eating and not drinking water." },
      { tl: "Problema sa water fountain, litter box, at food dispenser.", en: "Problems with the water fountain, litter box, and food dispenser." },
      { tl: "Sabihin AGAD kung kaunti na ang mga stocks (pagkain, litter sand, plastic, at iba pang supplies) para makabili agad — huwag hintayin na paubos na bago pa magsabi.", en: "Say IMMEDIATELY when stocks are getting low (food, litter sand, plastic, other supplies) so they can be bought — don't wait until they're almost gone." },
    ],
  },
  {
    title_tl: "Schedule (buod)",
    title_en: "Schedule (summary)",
    items: [
      { tl: "ARAW-ARAW: mop (kasama air purifier filter); aircon on 8–9AM, off 6PM (dehumidifier on, bintana at exhaust bukas); check fountain, food dispenser, litter tray, poop/ihi, litter sand; linisin suka/dumi; check gamit; muta; makipaglaro 10 min.", en: "DAILY: mop (incl. air purifier filter); aircon on 8–9AM, off 6PM (dehumidifier on, window and exhaust open); check fountain, food dispenser, litter tray, poop/pee, litter sand; clean accidents; check equipment; eye discharge; play 10 min." },
      { tl: "TUWING LUNES: suklayan ang mga pusa; i-refill litter sand; palitan plastic ng litter boxes; palitan tubig sa fountain; i-refill cat food.", en: "EVERY MONDAY: comb the cats; refill litter sand; replace litter box plastic; replace fountain water; refill cat food." },
      { tl: "TUWING BIYERNES (general cleaning): vacuum maigi; punasan ang mga gamit; punasan area ng fountain; mag-mop ng pader at sahig; i-refill litter sand; palitan plastic; palitan tubig sa fountain; i-refill cat food.", en: "EVERY FRIDAY (general cleaning): vacuum thoroughly; wipe items; wipe fountain area; mop walls and floor; refill litter sand; replace plastic; replace fountain water; refill cat food." },
      { tl: "IKA-15: hugasan ang fountains at palitan ang filter; gupitan ng kuko. IKA-30: hugasan ang fountains; gupitan ng kuko; hugasan ang food dispenser at bowls. Pwedeng ilipat ng isang araw kapag natapat sa Biyernes.", en: "15th: wash the fountains and replace the filter; trim nails. 30th: wash the fountains; trim nails; wash the food dispenser and bowls. May move by one day when it lands on a Friday." },
      { tl: "TUWING IKALAWANG BUWAN: hugasan ang mga litter boxes.", en: "EVERY SECOND MONTH: wash the litter boxes." },
    ],
  },
];
