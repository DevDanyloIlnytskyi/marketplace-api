const errorHandler = require('../utils/errorHandler');

module.exports.getALL = async function (req, res) {
    try {
        const rows = await req.models.BaseInfo.findAll({
            attributes: [
                'name',
                'phone',
                'adress',
                'email',
                'about',
                'contact',
                'facebook',
                'instagram',
                'telegram',
                'tiktok',
                'youtube',
                'logo',
                'x',
            ],
        });
        res.status(200).json(rows);
    } catch (error) {
        errorHandler(res, error);
    }
};
