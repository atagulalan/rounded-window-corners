/** @file Binds the actual corner rounding shader to the windows. */

import type {Bounds, RoundedCornerSettings} from '../utils/types.js';

import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import {readShader} from '../utils/file.js';
import {getPref} from '../utils/settings.js';

const [declarations, code] = readShader(
    import.meta.url,
    'shader/rounded_corners.frag',
);

class Uniforms {
    bounds = 0;
    clipRadius = 0;
    innerBorderWidth = 0;
    outerBorderWidth = 0;
    borderColor = 0;
    innerBorderedAreaBounds = 0;
    innerBorderedAreaClipRadius = 0;
    outerBorderedAreaBounds = 0;
    outerBorderedAreaClipRadius = 0;
    exponent = 0;
    pixelStep = 0;
}

export const RoundedCornersEffect = GObject.registerClass(
    {},
    class Effect extends Shell.GLSLEffect {
        /**
         * To store a uniform value, we need to know its location in the shader,
         * which is done by calling `this.get_uniform_location()`. This is
         * expensive, so we cache the location of uniforms when the shader is
         * created.
         */
        static uniforms: Uniforms = new Uniforms();

        constructor() {
            super();

            for (const k in Effect.uniforms) {
                Effect.uniforms[k as keyof Uniforms] =
                    this.get_uniform_location(k);
            }
        }

        vfunc_build_pipeline() {
            this.add_glsl_snippet(
                Cogl.SnippetHook.FRAGMENT,
                declarations,
                code,
                false,
            );
        }

        /**
         * Update uniforms of the shader.
         * For more information, see the comments in the shader file.
         *
         * @param scaleFactor - Desktop scaling factor
         * @param config - Rounded corners configuration
         * @param windowBounds - Bounds of the window without padding
         * @param borderColor - Border color to use for this window
         */
        updateUniforms(
            scaleFactor: number,
            config: RoundedCornerSettings,
            windowBounds: Bounds,
            borderColor: [number, number, number, number],
        ) {
            const separateBorderWidths = getPref('separate-border-widths');
            const borderWidth = getPref('border-width') * scaleFactor;
            let innerBorderWidth: number;
            let outerBorderWidth: number;

            if (separateBorderWidths) {
                innerBorderWidth = borderWidth;
                outerBorderWidth =
                    getPref('secondary-border-width') * scaleFactor;
            } else {
                innerBorderWidth = borderWidth > 0 ? borderWidth : 0;
                outerBorderWidth = borderWidth < 0 ? -borderWidth : 0;
            }

            const outerRadius = config.borderRadius * scaleFactor;
            const {padding, smoothing} = config;

            const bounds = [
                windowBounds.x1 + padding.left * scaleFactor,
                windowBounds.y1 + padding.top * scaleFactor,
                windowBounds.x2 - padding.right * scaleFactor,
                windowBounds.y2 - padding.bottom * scaleFactor,
            ];

            const innerBorderedAreaBounds = [
                bounds[0] + innerBorderWidth,
                bounds[1] + innerBorderWidth,
                bounds[2] - innerBorderWidth,
                bounds[3] - innerBorderWidth,
            ];

            let innerBorderedAreaRadius = outerRadius - innerBorderWidth;
            if (innerBorderedAreaRadius < 0.001) {
                innerBorderedAreaRadius = 0.0;
            }

            const outerBorderedAreaBounds = [
                bounds[0] - outerBorderWidth,
                bounds[1] - outerBorderWidth,
                bounds[2] + outerBorderWidth,
                bounds[3] + outerBorderWidth,
            ];

            let outerBorderedAreaRadius = outerRadius + outerBorderWidth;
            if (outerBorderedAreaRadius < 0.001) {
                outerBorderedAreaRadius = 0.0;
            }

            const pixelStep = [
                1 / this.actor.get_width(),
                1 / this.actor.get_height(),
            ];

            // This is needed for squircle corners
            let exponent = smoothing * 10 + 2;
            let radius = outerRadius * 0.5 * exponent;
            const maxRadius = Math.min(
                bounds[3] - bounds[0],
                bounds[4] - bounds[1],
            );
            if (radius > maxRadius) {
                exponent *= maxRadius / radius;
                radius = maxRadius;
            }
            innerBorderedAreaRadius *= radius / outerRadius;
            outerBorderedAreaRadius *= radius / outerRadius;

            this.#setUniforms(
                bounds,
                radius,
                innerBorderWidth,
                outerBorderWidth,
                borderColor,
                innerBorderedAreaBounds,
                innerBorderedAreaRadius,
                outerBorderedAreaBounds,
                outerBorderedAreaRadius,
                pixelStep,
                exponent,
            );
        }

        #setUniforms(
            bounds: number[],
            radius: number,
            innerBorderWidth: number,
            outerBorderWidth: number,
            borderColor: [number, number, number, number],
            innerBorderedAreaBounds: number[],
            innerBorderedAreaRadius: number,
            outerBorderedAreaBounds: number[],
            outerBorderedAreaRadius: number,
            pixelStep: number[],
            exponent: number,
        ) {
            const uniforms = Effect.uniforms;
            this.set_uniform_float(uniforms.bounds, 4, bounds);
            this.set_uniform_float(uniforms.clipRadius, 1, [radius]);
            this.set_uniform_float(uniforms.innerBorderWidth, 1, [
                innerBorderWidth,
            ]);
            this.set_uniform_float(uniforms.outerBorderWidth, 1, [
                outerBorderWidth,
            ]);
            this.set_uniform_float(uniforms.borderColor, 4, borderColor);
            this.set_uniform_float(
                uniforms.innerBorderedAreaBounds,
                4,
                innerBorderedAreaBounds,
            );
            this.set_uniform_float(uniforms.innerBorderedAreaClipRadius, 1, [
                innerBorderedAreaRadius,
            ]);
            this.set_uniform_float(
                uniforms.outerBorderedAreaBounds,
                4,
                outerBorderedAreaBounds,
            );
            this.set_uniform_float(uniforms.outerBorderedAreaClipRadius, 1, [
                outerBorderedAreaRadius,
            ]);
            this.set_uniform_float(uniforms.pixelStep, 2, pixelStep);
            this.set_uniform_float(uniforms.exponent, 1, [exponent]);
            this.queue_repaint();
        }
    },
);
