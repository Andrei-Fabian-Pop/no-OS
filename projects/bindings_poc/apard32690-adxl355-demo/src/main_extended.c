/***************************************************************************//**
 *   @file   main.c
 *   @brief  Main file for APARD32690 + ADXL355 demo.
 *   @author Demo Project
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

#include "common_data.h"
#include "adxl355.h"
#include "no_os_delay.h"
#include "no_os_print_log.h"

/***************************************************************************//**
 * @brief Main function - initializes UART and ADXL355.
 *
 * @return 0 on success, negative error code on failure.
*******************************************************************************/
int main(void)
{
	struct no_os_uart_desc *uart_desc;
	struct adxl355_dev *adxl355_desc;
	struct adxl355_frac_repr x, y, z;
	int ret;

	/* Initialize UART for debug output */
	ret = no_os_uart_init(&uart_desc, &uart_ip);
	if (ret) {
		return ret;
	}

	no_os_uart_stdio(uart_desc);

	pr_info("APARD32690 + ADXL355 Demo\n");
	pr_info("=========================\n");

	/* Assign SPI init params to ADXL355 init params */
	adxl355_ip.comm_init.spi_init = spi_ip;

	/* Initialize ADXL355 accelerometer */
	ret = adxl355_init(&adxl355_desc, adxl355_ip);
	if (ret) {
		pr_info("ADXL355 init failed: %d\n", ret);
		goto error_uart;
	}
	pr_info("ADXL355 initialized successfully\n");

	/* Perform soft reset */
	ret = adxl355_soft_reset(adxl355_desc);
	if (ret) {
		pr_info("ADXL355 soft reset failed: %d\n", ret);
		goto error_adxl355;
	}

	/* Configure ODR and LPF */
	ret = adxl355_set_odr_lpf(adxl355_desc, ADXL355_ODR_125HZ);
	if (ret) {
		pr_info("ADXL355 set ODR failed: %d\n", ret);
		goto error_adxl355;
	}

	/* Set measurement mode with temperature enabled */
	ret = adxl355_set_op_mode(adxl355_desc, ADXL355_MEAS_TEMP_ON_DRDY_OFF);
	if (ret) {
		pr_info("ADXL355 set mode failed: %d\n", ret);
		goto error_adxl355;
	}

	pr_info("ADXL355 configured - reading data...\n\n");

	/* Read acceleration data in a loop */
	while (1) {
		ret = adxl355_get_xyz(adxl355_desc, &x, &y, &z);
		if (ret) {
			pr_info("Read error: %d\n", ret);
		} else {
			pr_info("X: %d.%09u  Y: %d.%09u  Z: %d.%09u m/s^2\n",
				(int)x.integer, (unsigned int)(x.fractional < 0 ? -x.fractional : x.fractional),
				(int)y.integer, (unsigned int)(y.fractional < 0 ? -y.fractional : y.fractional),
				(int)z.integer, (unsigned int)(z.fractional < 0 ? -z.fractional : z.fractional));
		}

		no_os_mdelay(500);
	}

error_adxl355:
	adxl355_remove(adxl355_desc);
error_uart:
	no_os_uart_remove(uart_desc);
	return ret;
}
