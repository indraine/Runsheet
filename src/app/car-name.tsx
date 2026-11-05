import { Show } from "solid-js"
import alpine from "~/assets/brands/alpine.svg?url"
import astonmartin from "~/assets/brands/astonmartin.svg?url"
import audi from "~/assets/brands/audi.svg?url"
import bentley from "~/assets/brands/bentley.svg?url"
import bmw from "~/assets/brands/bmw.svg?url"
import chevrolet from "~/assets/brands/chevrolet.svg?url"
import ferrari from "~/assets/brands/ferrari.svg?url"
import ford from "~/assets/brands/ford.svg?url"
import ginetta from "~/assets/brands/ginetta.svg?url"
import honda from "~/assets/brands/honda.svg?url"
import jaguar from "~/assets/brands/jaguar.svg?url"
import ktm from "~/assets/brands/ktm.svg?url"
import lamborghini from "~/assets/brands/lamborghini.svg?url"
import lexus from "~/assets/brands/lexus.svg?url"
import maserati from "~/assets/brands/maserati.svg?url"
import mclaren from "~/assets/brands/mclaren.svg?url"
import mercedes from "~/assets/brands/mercedes.svg?url"
import nissan from "~/assets/brands/nissan.svg?url"
import porsche from "~/assets/brands/porsche.svg?url"
import { carBrand, type CarBrand } from "~/domain"
import { carName } from "~/i18n"

const BRAND_LOGOS: Record<CarBrand, string> = {
    alpine,
    astonmartin,
    audi,
    bentley,
    bmw,
    chevrolet,
    ferrari,
    ford,
    ginetta,
    honda,
    jaguar,
    ktm,
    lamborghini,
    lexus,
    maserati,
    mclaren,
    mercedes,
    nissan,
    porsche,
}

type CarNameProps = {
    code: string
    class?: string
}

/** Car model name with its brand logo on the left; stays inline so parents can truncate it. */
export const CarName = (props: CarNameProps) => (
    <span class={props.class}>
        <BrandLogo code={props.code} />
        {carName(props.code)}
    </span>
)

const BrandLogo = (props: { code: string }) => (
    <Show when={carBrand(props.code)}>
        {brand => (
            <img
                src={BRAND_LOGOS[brand()]}
                alt=""
                draggable={false}
                class="mr-1.5 inline-block h-[1.1em] w-[1.8em] object-contain align-[-0.2em]"
            />
        )}
    </Show>
)
