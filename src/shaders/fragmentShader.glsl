precision mediump float;

uniform vec2 u_resolution;
uniform sampler2D u_state;
uniform float u_time;

const float R1 = 1.0;
const float R2 = 5.0;
const float B1 = 0.22;
const float B2 = 0.33;
const float D1 = 0.47;
const float D2 = 0.49;

float smoothstepRange(float edge0, float edge1, float x) {
    return smoothstep(edge0, edge1, x);
}

void main() {
    vec2 st = gl_FragCoord.xy / u_resolution;
    float currentState = texture2D(u_state, st).r;

    float innerState = 0.0;
    float outerState = 0.0;
    float innerWeight = 0.0;
    float outerWeight = 0.0;
    const float stepSize = 1.0;
    const float weightFactor = 10.0;

    for (float x = -R2; x <= R2; x += stepSize) {
        for (float y = -R2; y <= R2; y += stepSize) {
            vec2 offset = vec2(x, y) / u_resolution;
            float d = length(offset);
            if (d <= R1) {
                float weight = exp(-d * weightFactor);
                innerState += texture2D(u_state, st + offset).r * weight;
                innerWeight += weight;
            } else if (d <= R2) {
                float weight = exp(-d * weightFactor);
                outerState += texture2D(u_state, st + offset).r * weight;
                outerWeight += weight;
            }
        }
    }

    if (innerWeight > 0.0) innerState /= innerWeight;
    if (outerWeight > 0.0) outerState /= outerWeight;

    float neighborState = mix(innerState, outerState, 0.5);
    float birth = smoothstepRange(B1, B2, neighborState);
    float death = smoothstepRange(D1, D2, neighborState);
    float nextState = currentState * (1.0 - death) + (1.0 - currentState) * birth;

    gl_FragColor = vec4(vec3(nextState), 1.0);
}