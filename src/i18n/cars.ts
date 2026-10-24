import type { Locale } from "~/i18n/locale"
import { locale } from "~/i18n/locale"

const en = {
    amr_v12_vantage_gt3: "Aston Martin V12",
    amr_v8_vantage_gt3: "Aston Martin V8",
    amr_v8_vantage_gt4: "Aston Martin Vantage GT4",
    audi_r8_lms: "Audi R8 LMS",
    audi_r8_lms_evo: "Audi R8 LMS Evo",
    audi_r8_lms_evo_ii: "Audi R8 LMS Evo II",
    audi_r8_lms_gt2: "Audi R8 LMS GT2",
    audi_r8_gt4: "Audi R8 LMS GT4",
    bentley_continental_gt3_2016: "Bentley Continental 2015",
    bentley_continental_gt3_2018: "Bentley Continental 2018",
    bmw_m2_cs_racing: "BMW M2 CS",
    bmw_m4_gt3: "BMW M4",
    bmw_m4_gt4: "BMW M4 GT4",
    bmw_m6_gt3: "BMW M6",
    chevrolet_camaro_gt4r: "Chevrolet Camaro GT4",
    ferrari_296_gt3: "Ferrari 296",
    ferrari_488_challenge_evo: "Ferrari 488 Challenge",
    ferrari_488_gt3: "Ferrari 488",
    ferrari_488_gt3_evo: "Ferrari 488 Evo",
    ford_mustang_gt3: "Ford Mustang",
    ginetta_g55_gt4: "Ginetta G55 GT4",
    honda_nsx_gt3: "Honda NSX",
    honda_nsx_gt3_evo: "Honda NSX Evo",
    jaguar_g3: "Jaguar G3",
    ktm_xbow_gt2: "KTM X-Bow GT2",
    ktm_xbow_gt4: "KTM X-Bow GT4",
    lamborghini_gallardo_rex: "Lamborghini Gallardo",
    lamborghini_huracan_gt3: "Lamborghini Huracán",
    lamborghini_huracan_gt3_evo: "Lamborghini Huracán Evo",
    lamborghini_huracan_gt3_evo2: "Lamborghini Huracán Evo2",
    lamborghini_huracan_st: "Lamborghini Huracán ST",
    lamborghini_huracan_st_evo2: "Lamborghini Huracán ST Evo2",
    lexus_rc_f_gt3: "Lexus RC F",
    maserati_mc20_gt2: "Maserati MC20 GT2",
    maserati_mc_gt4: "Maserati MC GT4",
    mclaren_570s_gt4: "McLaren 570S GT4",
    mclaren_650s_gt3: "McLaren 650S",
    mclaren_720s_gt3: "McLaren 720S",
    mclaren_720s_gt3_evo: "McLaren 720S Evo",
    mercedes_amg_gt2: "Mercedes-AMG GT2",
    mercedes_amg_gt3: "Mercedes-AMG GT3",
    mercedes_amg_gt3_evo: "Mercedes-AMG GT3 Evo",
    mercedes_amg_gt4: "Mercedes-AMG GT4",
    nissan_gt_r_gt3_2017: "Nissan GT-R 2015",
    nissan_gt_r_gt3_2018: "Nissan GT-R 2018",
    porsche_718_cayman_gt4_mr: "Porsche 718 Cayman GT4",
    porsche_935: "Porsche 935",
    porsche_991_gt2_rs_mr: "Porsche 911 GT2 RS",
    porsche_991_gt3_r: "Porsche 991 GT3 R",
    porsche_991ii_gt3_cup: "Porsche 991 II Cup",
    porsche_991ii_gt3_r: "Porsche 991 II GT3 R",
    porsche_992_gt3_cup: "Porsche 992 Cup",
    porsche_992_gt3_r: "Porsche 992 GT3 R",
    alpine_a110_gt4: "Alpine A110 GT4",
} as const

const ru: typeof en = en

const carDict: Record<Locale, typeof en> = { en, ru }

export function carName(code: string): string {
    const names: Record<string, string> = carDict[locale()]
    return names[code] ?? code
}
