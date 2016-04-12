var

spriteBird,
spriteCookie,
spriteBackground,
spriteFinger,
spriteLogo,
spriteBall,
spriteRestart,
spriteSpike;

/**
 * Simple sprite class
 *
 * @param {Image}  img    spritesheet image
 * @param {number} x      x-position in spritesheet
 * @param {number} y      y-position in spritesheet
 * @param {number} width  width of sprite
 * @param {number} height height of sprite
 */

function Sprite(img, x, y, width, height) {
    this.img = img;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
}

/**
 * Draw sprite at canvas context
 *
 * @param  {CanvasRenderingContext2D} ctx context used for drawing
 * @param  {number} x   x-position on canvas to draw from
 * @param  {number} y   y-position on canvas to draw from
 */
Sprite.prototype.draw = function(ctx, x, y) {
    ctx.drawImage(this.img, this.x, this.y, this.width, this.height, x, y, this.width, this.height);
};

/**
 * Initate all sprite
 *
 * @param  {Image} img spritesheet image
 */
function initSprites(img) {

    spriteBackground = {};
    spriteBackground.color = "#27ae60";

    spriteBird = [
        new Sprite(img, 0, 0, 56, 58), // right
        new Sprite(img, 58, 0, 56, 58), //left
        new Sprite(img, 114, 0, 54, 58), //flap right
        new Sprite(img, 172, 0, 54, 58), // flap left

        new Sprite(img, 0, 62, 56, 58), // right dead
        new Sprite(img, 58, 62, 56, 58), //left dead
        new Sprite(img, 114, 62, 54, 58), //flap right dead
        new Sprite(img, 172, 62, 54, 58) // flap left dead
    ];

    spriteCookie = [
        new Sprite(img, 226, 0, 30, 20),
        new Sprite(img, 226, 20, 30, 20),
        new Sprite(img, 226, 40, 30, 20)
    ];

    spriteRestart = new Sprite(img, 384, 0, 60, 100);

    spriteFinger = new Sprite(img, 268, 0, 62, 90);

    spriteLogo = new Sprite(img, 0, 122, 298, 170);

    spriteBall = new Sprite(img, 338, 0, 46, 44);

    spriteSpike = [
        new Sprite(img, 442, 0 , 26, 33),
        new Sprite(img, 472, 0, 26, 33)
    ];
}
