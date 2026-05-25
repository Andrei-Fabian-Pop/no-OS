/***************************************************************************//**
 *   @file   user_app.c
 *   @brief  User application code for ADXL355 demo.
 *
 *   This file is generated once and will not be overwritten.
 *   Add your custom application code in the user_app() function below.
 ********************************************************************************
 * Copyright 2024(c) Analog Devices, Inc.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Analog Devices, Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY ANALOG DEVICES, INC. "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL ANALOG DEVICES, INC. BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 * OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *******************************************************************************/

#include "user_app.h"
#include "adxl355.h"
#include "no_os_print_log.h"
#include "user_app.h"
#include "adxl355.h"
#include "no_os_print_log.h"
#include "no_os_delay.h"

/***************************************************************************//**
 * @brief User application code.
 *
 * This function is called after all peripherals are initialized.
 * Add your custom application logic here.
 *
 * @param adxl355_dev - Pointer to the initialized ADXL355 device.
 *******************************************************************************/
void user_app(struct adxl355_dev *adxl355_dev)
{
        /* Add your application code here */
        struct adxl355_frac_repr x, y, z;
        int ret;
        /* Set measurement mode */
        ret = adxl355_set_op_mode(adxl355_dev, ADXL355_MEAS_TEMP_ON_DRDY_ON);
        if (ret) {
                pr_err("Failed to set op mode: %d\n", ret);
                return;
        }

        pr_info("ADXL355 initialized. Reading XYZ...\n");

        while (1) {
                ret = adxl355_get_xyz(adxl355_dev, &x, &y, &z);
                if (ret) {
                        pr_err("Failed to read XYZ: %d\n", ret);
                } else {
                        pr_info("X: %lld.%06ld  Y: %lld.%06ld  Z: %lld.%06ld g\n",
                                        x.integer, x.fractional,
                                        y.integer, y.fractional,
                                        z.integer, z.fractional);
                }

                no_os_mdelay(500);
        }
}
