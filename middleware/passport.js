const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
require('dotenv').config();

const options = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.jwtkey,
    passReqToCallback: true,
};

module.exports = passport =>{
    passport.use(
        new JwtStrategy(options, (req, payload, done) =>{
        try {
          if (!req.models || !req.models.User) {
            if (process.env.ORDER_AUTH_DEBUG === 'true') {
              console.info('[order-auth] passport_no_tenant_context', {
                host: req.get('host'),
                marketplaceHost: req.get('x-marketplace-host'),
              });
            }
            return done(null, false);
          }
          req.models.User.findOne({
                where: {
                    login: payload.login
                }
            }).then(answer => {
                if (answer){
                    done(null, answer);
                }
                else {
                    if (process.env.ORDER_AUTH_DEBUG === 'true') {
                      console.info('[order-auth] passport_user_not_found', {
                        tenant: req.tenant?.domain ?? req.tenant?.id,
                        login: payload.login,
                      });
                    }
                    done(null, false);
                }
             }).catch((error) => {
                done(null, error);
            });    
        } catch (error) {
            done(error, false);
        }   
        })
    )
}
